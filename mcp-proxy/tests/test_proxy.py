"""Every enforcement branch, through real MCP sessions (client -> proxy -> fake downstream) and a scripted gateway."""

from __future__ import annotations

import logging
import os

import mcp_types as types
import pytest

from agentshield_mcp_proxy.enforcer import MAX_INSPECT_CHARS
from agentshield_mcp_proxy.gateway import sdk

from .conftest import (API_KEY, REVIEW_ID, TOKEN, FakeDownstream, FakeGateway, evaluation, proxy, review_status,
                       text_of)

pytestmark = pytest.mark.anyio


@pytest.fixture
def root(tmp_path):
    workspace = tmp_path / "ws"
    (workspace / "notes").mkdir(parents=True)
    (workspace / "notes" / "plan.md").write_text("plan")
    (workspace / ".env").write_text("FAKE=1")
    return workspace


def real(path) -> str:
    return os.path.realpath(str(path))


def deny_env(resource, action, args):
    if resource.endswith(".env"):
        return evaluation("DENY", resource, action, reason="Access to credential or secret resource is denied by policy.")
    return evaluation("ALLOW", resource, action)


# ---------------------------------------------------------------- tools/list


async def test_list_tools_passes_through_without_output_schemas(root):
    async with proxy(root, FakeGateway()) as (client, _, _):
        listing = await client.list_tools()
    assert "read_text_file" in {tool.name for tool in listing.tools}
    assert all(tool.output_schema is None for tool in listing.tools)


# ---------------------------------------------------------------- ALLOW


async def test_allow_redeems_then_calls_downstream_with_canonical_path(root):
    gateway = FakeGateway()
    async with proxy(root, gateway) as (client, _, downstream):
        result = await client.call_tool("read_text_file", {"path": "notes/plan.md"})
    assert not result.is_error
    assert text_of(result) == "read_text_file ok"
    assert result.structured_content is None  # never forwarded: it would bypass inspection
    expected_args = {"path": real(root / "notes" / "plan.md")}
    assert gateway.kinds() == ["evaluate", "redeem", "inspect"]
    _, tool, action, resource, args, session = gateway.of("evaluate")[0]
    assert (tool, action, resource, args) == ("filesystem", "READ", "notes/plan.md", expected_args)
    assert session.startswith("mcp-")
    assert gateway.of("redeem")[0][1:5] == ("filesystem", "READ", "notes/plan.md", expected_args)
    assert downstream.calls == [("read_text_file", expected_args)]


async def test_root_tool_without_path_is_evaluated_on_root(root):
    gateway = FakeGateway()
    async with proxy(root, gateway) as (client, _, downstream):
        result = await client.call_tool("list_allowed_directories", {})
    assert not result.is_error
    assert gateway.of("evaluate")[0][3] == "."
    assert downstream.calls == [("list_allowed_directories", {})]


# ---------------------------------------------------------------- DENY


async def test_deny_blocks_with_reason_and_redacted_findings(root):
    finding = sdk.Finding(category="SECRET", type="AWS_ACCESS_KEY", location="arguments.content",
                          preview="AKIA… (20 chars)")
    gateway = FakeGateway(decide=lambda r, a, x: evaluation("DENY", r, a, reason="Secret in arguments.",
                                                             findings=[finding]))
    async with proxy(root, gateway) as (client, _, downstream):
        result = await client.call_tool("write_file", {"path": "notes/x.txt", "content": "secret"})
    assert result.is_error
    text = text_of(result)
    assert text.startswith("Blocked by AgentShield: Secret in arguments.")
    assert "SECRET AWS_ACCESS_KEY at arguments.content: AKIA… (20 chars)" in text
    assert downstream.calls == []
    assert gateway.of("redeem") == []


async def test_traversal_is_evaluated_as_canonical_path(root):
    gateway = FakeGateway(decide=deny_env)
    async with proxy(root, gateway) as (client, _, downstream):
        result = await client.call_tool("read_text_file", {"path": "notes/../.env"})
    assert result.is_error and "Blocked by AgentShield" in text_of(result)
    assert gateway.of("evaluate")[0][3] == ".env"
    assert downstream.calls == []


# ---------------------------------------------------------------- paths


@pytest.mark.parametrize("path", ["../outside.txt", "/etc/passwd", "notes/../../outside.txt", "", 42])
async def test_path_outside_root_is_rejected_before_any_call(root, path):
    gateway = FakeGateway()
    async with proxy(root, gateway) as (client, _, downstream):
        result = await client.call_tool("read_text_file", {"path": path})
    assert result.is_error and "Nothing was run" in text_of(result)
    assert gateway.calls == [] and downstream.calls == []


async def test_symlink_escape_is_rejected(root, tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.txt").write_text("x")
    (root / "link").symlink_to(outside)
    gateway = FakeGateway()
    async with proxy(root, gateway) as (client, _, downstream):
        result = await client.call_tool("read_text_file", {"path": "link/secret.txt"})
        new_file = await client.call_tool("write_file", {"path": "link/new.txt", "content": "x"})
    assert "outside the allowed directory" in text_of(result)
    assert new_file.is_error
    assert gateway.calls == [] and downstream.calls == []


async def test_symlink_inside_root_is_evaluated_as_its_target(root):
    (root / "harmless.txt").symlink_to(root / ".env")
    gateway = FakeGateway(decide=deny_env)
    async with proxy(root, gateway) as (client, _, downstream):
        result = await client.call_tool("read_text_file", {"path": "harmless.txt"})
    assert result.is_error
    assert gateway.of("evaluate")[0][3] == ".env"
    assert downstream.calls == []


async def test_missing_path_argument_is_rejected(root):
    gateway = FakeGateway()
    async with proxy(root, gateway) as (client, _, downstream):
        result = await client.call_tool("read_text_file", {})
    assert result.is_error and "missing" in text_of(result)
    assert gateway.calls == []


# ---------------------------------------------------------------- multi-path


async def test_multi_path_requires_every_path_allowed(root):
    gateway = FakeGateway(decide=deny_env)
    async with proxy(root, gateway) as (client, _, downstream):
        result = await client.call_tool("read_multiple_files", {"paths": ["notes/plan.md", "./.env"]})
    assert result.is_error and ".env" in text_of(result)
    assert [c[3] for c in gateway.of("evaluate")] == ["notes/plan.md", ".env"]
    assert gateway.of("redeem") == [] and downstream.calls == []


async def test_multi_path_all_allowed_redeems_each_then_runs_once(root):
    gateway = FakeGateway()
    async with proxy(root, gateway) as (client, _, downstream):
        result = await client.call_tool("read_multiple_files", {"paths": ["notes/plan.md", "notes/../notes/plan.md",
                                                                          "README.md"]})
    assert not result.is_error
    # duplicates after canonicalization are evaluated once
    assert [c[3] for c in gateway.of("evaluate")] == ["notes/plan.md", "README.md"]
    assert [c[3] for c in gateway.of("redeem")] == ["notes/plan.md", "README.md"]
    canonical = [real(root / "notes/plan.md"), real(root / "notes/plan.md"), real(root) + "/README.md"]
    assert downstream.calls == [("read_multiple_files", {"paths": canonical})]


async def test_move_file_evaluates_source_and_destination(root):
    gateway = FakeGateway()
    async with proxy(root, gateway) as (client, _, downstream):
        await client.call_tool("move_file", {"source": "notes/plan.md", "destination": "notes/old.md"})
    assert [(c[2], c[3]) for c in gateway.of("evaluate")] == [("WRITE", "notes/plan.md"), ("WRITE", "notes/old.md")]
    assert len(downstream.calls) == 1


async def test_multi_path_with_one_path_outside_root_runs_nothing(root):
    gateway = FakeGateway()
    async with proxy(root, gateway) as (client, _, downstream):
        result = await client.call_tool("move_file", {"source": "notes/plan.md", "destination": "../stolen.md"})
    assert result.is_error
    assert gateway.calls == [] and downstream.calls == []


# ---------------------------------------------------------------- unmapped


async def test_unmapped_tool_is_evaluated_as_execute(root):
    gateway = FakeGateway(decide=lambda r, a, x: evaluation("DENY", r, a, reason="Not granted."))
    async with proxy(root, gateway) as (client, _, downstream):
        result = await client.call_tool("read_media_file", {"path": "img.png"})
    assert result.is_error
    _, tool, action, resource, args, _ = gateway.of("evaluate")[0]
    assert (tool, action, resource, args) == ("filesystem", "EXECUTE", "tool:read_media_file", {"path": "img.png"})
    assert downstream.calls == []


# ---------------------------------------------------------------- REVIEW


def review_then(*statuses):
    def decide(resource, action, args):
        return evaluation("REVIEW", resource, action, review_id=REVIEW_ID)
    return FakeGateway(decide=decide, reviews=list(statuses))


async def test_review_still_pending_is_held_with_review_id(root):
    gateway = review_then(review_status("PENDING", resource="notes/x.txt"))
    async with proxy(root, gateway, wait=9) as (client, enforcer, downstream):
        result = await client.call_tool("write_file", {"path": "notes/x.txt", "content": "a@b.com"})
    assert result.is_error
    assert text_of(result) == (f"Held for human review {REVIEW_ID}. Approve it in the AgentShield console, then ask "
                               "me to retry this exact action.")
    # polled at 0, 3, 6 and 9 seconds, then gave up
    assert len(gateway.of("get_review")) == 4
    assert downstream.calls == [] and gateway.of("redeem") == []
    assert len(enforcer.reviews) == 1


async def test_review_approved_while_waiting_claims_redeems_and_runs(root):
    gateway = review_then(review_status("PENDING", resource="notes/x.txt"),
                          review_status("APPROVED", resource="notes/x.txt", reviewer="sagar"))
    async with proxy(root, gateway, wait=90) as (client, enforcer, downstream):
        result = await client.call_tool("write_file", {"path": "notes/x.txt", "content": "a@b.com"})
    assert not result.is_error
    assert gateway.kinds() == ["evaluate", "get_review", "get_review", "claim", "redeem", "inspect"]
    assert gateway.of("redeem")[0][4] == {"path": real(root / "notes/x.txt"), "content": "a@b.com"}
    assert len(downstream.calls) == 1
    assert enforcer.reviews == {}


async def test_review_rejected_is_blocked(root):
    gateway = review_then(review_status("REJECTED", resource="notes/x.txt", reviewer="sagar", note="no PII"))
    async with proxy(root, gateway, wait=90) as (client, enforcer, downstream):
        result = await client.call_tool("write_file", {"path": "notes/x.txt", "content": "a@b.com"})
    assert result.is_error
    assert "rejected by sagar: no PII" in text_of(result)
    assert downstream.calls == [] and enforcer.reviews == {}


async def test_review_expired_is_blocked(root):
    gateway = review_then(review_status("PENDING", resource="notes/x.txt", expired=True))
    async with proxy(root, gateway, wait=90) as (client, enforcer, downstream):
        result = await client.call_tool("write_file", {"path": "notes/x.txt", "content": "a@b.com"})
    assert result.is_error and "expired" in text_of(result)
    assert downstream.calls == [] and enforcer.reviews == {}


async def test_retry_checks_and_claims_the_existing_review(root):
    gateway = review_then(review_status("PENDING", resource="notes/x.txt"))
    args = {"path": "notes/x.txt", "content": "a@b.com"}
    async with proxy(root, gateway, wait=0) as (client, enforcer, downstream):
        held = await client.call_tool("write_file", args)
        assert "Held for human review" in text_of(held)
        gateway.reviews[:] = [review_status("APPROVED", resource="notes/x.txt", reviewer="sagar")]
        result = await client.call_tool("write_file", args)
    assert not result.is_error
    assert len(gateway.of("evaluate")) == 1  # the retry did not create a second review
    assert gateway.of("claim") == [("claim", REVIEW_ID)]
    assert len(downstream.calls) == 1


async def test_retry_of_a_different_call_does_not_reuse_the_review(root):
    gateway = review_then(review_status("PENDING", resource="notes/x.txt"))
    async with proxy(root, gateway, wait=0) as (client, enforcer, downstream):
        await client.call_tool("write_file", {"path": "notes/x.txt", "content": "a@b.com"})
        await client.call_tool("write_file", {"path": "notes/x.txt", "content": "other@b.com"})
    assert len(gateway.of("evaluate")) == 2


async def test_retry_while_still_pending_returns_at_once_without_new_review(root):
    gateway = review_then(review_status("PENDING", resource="notes/x.txt"))
    args = {"path": "notes/x.txt", "content": "a@b.com"}
    async with proxy(root, gateway, wait=90) as (client, enforcer, downstream):
        first = await client.call_tool("write_file", args)
        assert "Held for human review" in text_of(first)
        polls, waited = len(gateway.of("get_review")), enforcer.monotonic()
        assert waited == 90  # the first attempt waited the full time

        gateway.reviews[:] = [review_status("IN_REVIEW", resource="notes/x.txt")]
        again = await client.call_tool("write_file", args)
        assert enforcer.monotonic() == waited  # the retry did not wait at all
    assert again.is_error
    assert text_of(again) == (f"Still waiting for human review {REVIEW_ID} (status: IN_REVIEW, expires "
                              "2099-01-01 00:00:00 UTC). Approve it in the AgentShield console, then ask me to retry.")
    assert len(gateway.of("get_review")) == polls + 1  # one read of the review, no polling
    assert len(gateway.of("evaluate")) == 1
    assert downstream.calls == [] and gateway.of("claim") == []
    assert len(enforcer.reviews) == 1  # still remembered for the next retry


async def test_retry_with_approved_review_claims_and_runs_without_waiting(root):
    gateway = review_then(review_status("PENDING", resource="notes/x.txt"))
    args = {"path": "notes/x.txt", "content": "a@b.com"}
    async with proxy(root, gateway, wait=90) as (client, enforcer, downstream):
        await client.call_tool("write_file", args)
        waited = enforcer.monotonic()
        gateway.calls.clear()
        gateway.reviews[:] = [review_status("APPROVED", resource="notes/x.txt", reviewer="sagar")]
        result = await client.call_tool("write_file", args)
        assert enforcer.monotonic() == waited
    assert not result.is_error
    assert gateway.kinds() == ["get_review", "claim", "redeem", "inspect"]
    assert len(downstream.calls) == 1 and enforcer.reviews == {}


async def test_retry_after_the_approval_was_used_evaluates_again(root):
    gateway = review_then(review_status("PENDING", resource="notes/x.txt"))
    args = {"path": "notes/x.txt", "content": "a@b.com"}
    async with proxy(root, gateway, wait=0) as (client, enforcer, downstream):
        await client.call_tool("write_file", args)
        gateway.reviews[:] = [review_status("APPROVED", resource="notes/x.txt", consumed=True)]
        await client.call_tool("write_file", args)
    assert len(gateway.of("evaluate")) == 2


async def test_claim_for_a_different_operation_is_blocked(root):
    gateway = review_then(review_status("APPROVED", resource="somewhere/else.txt"))
    async with proxy(root, gateway, wait=90) as (client, _, downstream):
        result = await client.call_tool("write_file", {"path": "notes/x.txt", "content": "x"})
    assert result.is_error and "does not match" in text_of(result)
    assert downstream.calls == []


# ---------------------------------------------------------------- redeem and gateway failures


async def test_redeem_failure_means_no_downstream_call(root):
    gateway = FakeGateway(redeem_error=sdk.GatewayRejected(409, "This decision was already redeemed."))
    async with proxy(root, gateway) as (client, _, downstream):
        result = await client.call_tool("read_text_file", {"path": "notes/plan.md"})
    assert result.is_error and "fail closed" in text_of(result)
    assert downstream.calls == []


@pytest.mark.parametrize("error", [sdk.GatewayUnavailable("could not connect to the gateway"),
                                   sdk.GatewayUnavailable("request to the gateway timed out"),
                                   sdk.MalformedResponse("gateway response is not valid JSON"),
                                   sdk.GatewayRejected(401)])
async def test_gateway_failure_fails_closed(root, error):
    gateway = FakeGateway(evaluate_error=error)
    async with proxy(root, gateway) as (client, _, downstream):
        result = await client.call_tool("read_text_file", {"path": "notes/plan.md"})
    assert result.is_error and "Nothing was run (fail closed)" in text_of(result)
    assert downstream.calls == []


async def test_malformed_http_reply_through_the_real_client_fails_closed(root):
    class Response:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def read(self):
            return b'{"decision": "ALLOW"}'  # no echo, no requestId: cannot be trusted

    client = sdk.AgentShieldClient(sdk.GatewayConfig("http://gateway.invalid", "agent", API_KEY),
                                   opener=lambda request, timeout: Response())
    async with proxy(root, client) as (mcp_client, _, downstream):
        result = await mcp_client.call_tool("read_text_file", {"path": "notes/plan.md"})
    assert result.is_error and "MalformedResponse" in text_of(result)
    assert downstream.calls == []


async def test_allow_without_token_fails_closed(root):
    def decide(resource, action, args):
        result = evaluation("ALLOW", resource, action)
        return sdk.Evaluation(**{**result.__dict__, "decision_token": None})
    gateway = FakeGateway(decide=decide)
    async with proxy(root, gateway) as (client, _, downstream):
        result = await client.call_tool("read_text_file", {"path": "notes/plan.md"})
    assert result.is_error and downstream.calls == []


async def test_missing_credentials_fail_every_call(root):
    async with proxy(root, None, config_error="missing required environment variable(s): X") as (client, _, ds):
        listing = await client.list_tools()
        result = await client.call_tool("read_text_file", {"path": "notes/plan.md"})
    assert listing.tools  # the proxy still starts and lists tools
    assert result.is_error and "not configured" in text_of(result)
    assert ds.calls == []


async def test_downstream_exception_is_reported_as_tool_error(root):
    def explode(name, args):
        raise RuntimeError("boom")
    async with proxy(root, FakeGateway(), FakeDownstream(explode)) as (client, _, _):
        result = await client.call_tool("read_text_file", {"path": "notes/plan.md"})
    assert result.is_error


# ---------------------------------------------------------------- output inspection


def output(text: str, *extra) -> FakeDownstream:
    return FakeDownstream(lambda name, args: types.CallToolResult(
        content=[types.TextContent(text=text), *extra], structured_content={"content": text}))


def verdict(kind: str, *findings):
    def inspect(content):
        redacted = content.replace("a@b.com", "[REDACTED:EMAIL]")
        return sdk.OutputInspection(request_id="req-out", verdict=kind, findings=tuple(findings),
                                    redacted_content=redacted)
    return inspect


SECRET_FINDING = sdk.Finding("SECRET", "AWS_ACCESS_KEY", "content", "AKIA… (20 chars)")
EMAIL_FINDING = sdk.Finding("PII", "EMAIL", "content", "[EMAIL] (7 chars)")


async def test_output_deny_is_withheld(root):
    gateway = FakeGateway(verdict=verdict("DENY", SECRET_FINDING))
    async with proxy(root, gateway, output("key: AKIA...")) as (client, _, _):
        result = await client.call_tool("read_text_file", {"path": "notes/plan.md"})
    assert result.is_error
    assert text_of(result) == "Output withheld by AgentShield: contained AWS_ACCESS_KEY. Request req-out."
    assert gateway.of("inspect")[0][1:] == ("filesystem", "key: AKIA...")


async def test_output_review_returns_redacted_content(root):
    gateway = FakeGateway(verdict=verdict("REVIEW", EMAIL_FINDING))
    async with proxy(root, gateway, output("mail a@b.com")) as (client, _, _):
        result = await client.call_tool("read_text_file", {"path": "notes/plan.md"})
    assert not result.is_error
    assert result.content[0].text == "mail [REDACTED:EMAIL]"
    assert "a@b.com" not in text_of(result)
    assert "redacted EMAIL" in text_of(result)
    assert result.structured_content is None


async def test_output_clean_passes_through_unchanged(root):
    gateway = FakeGateway()
    async with proxy(root, gateway, output("hello")) as (client, _, _):
        result = await client.call_tool("read_text_file", {"path": "notes/plan.md"})
    assert [block.text for block in result.content] == ["hello"]
    assert not result.is_error


async def test_oversized_output_is_withheld_without_inspection(root):
    gateway = FakeGateway()
    async with proxy(root, gateway, output("x" * (MAX_INSPECT_CHARS + 1))) as (client, _, _):
        result = await client.call_tool("read_text_file", {"path": "notes/plan.md"})
    assert result.is_error and "more than the 262144" in text_of(result)
    assert gateway.of("inspect") == []


async def test_output_limit_counts_utf16_units_like_the_gateway(root):
    gateway = FakeGateway()
    # 131073 astral characters are 262146 Java characters: over the limit although len() is 131073.
    async with proxy(root, gateway, output("\U0001F600" * (MAX_INSPECT_CHARS // 2 + 1))) as (client, _, _):
        result = await client.call_tool("read_text_file", {"path": "notes/plan.md"})
    assert result.is_error and gateway.of("inspect") == []


async def test_output_inspection_failure_withholds_output(root):
    gateway = FakeGateway(inspect_error=sdk.GatewayUnavailable("could not connect to the gateway"))
    async with proxy(root, gateway, output("hello")) as (client, _, _):
        result = await client.call_tool("read_text_file", {"path": "notes/plan.md"})
    assert result.is_error and "could not be inspected" in text_of(result)
    assert "hello" not in text_of(result)


async def test_non_text_content_passes_through_uninspected_and_is_logged(root, caplog):
    image = types.ImageContent(data="aGVsbG8=", mime_type="image/png")
    gateway = FakeGateway()
    downstream = FakeDownstream(lambda name, args: types.CallToolResult(content=[image],
                                                                         structured_content={"content": ""}))
    with caplog.at_level(logging.INFO, logger="agentshield.mcp_proxy"):
        async with proxy(root, gateway, downstream) as (client, _, _):
            result = await client.call_tool("read_text_file", {"path": "notes/plan.md"})
    assert isinstance(result.content[0], types.ImageContent)
    assert gateway.of("inspect") == []
    assert "WITHOUT inspection" in caplog.text


async def test_embedded_text_resource_is_inspected(root):
    embedded = types.EmbeddedResource(resource=types.TextResourceContents(uri="file:///x", text="AKIA..."))
    gateway = FakeGateway(verdict=verdict("DENY", SECRET_FINDING))
    downstream = FakeDownstream(lambda name, args: types.CallToolResult(content=[embedded],
                                                                         structured_content={"content": ""}))
    async with proxy(root, gateway, downstream) as (client, _, _):
        result = await client.call_tool("read_text_file", {"path": "notes/plan.md"})
    assert result.is_error and "withheld" in text_of(result)


# ---------------------------------------------------------------- logs


async def test_logs_never_contain_arguments_outputs_tokens_or_keys(root, caplog):
    secret_arg = "ARGUMENT-SECRET-a@b.com-4111111111111111"
    secret_out = "OUTPUT-SECRET-CONTENT"
    finding = sdk.Finding("PII", "EMAIL", "arguments.content", "[EMAIL] (7 chars)")
    gateway = review_then(review_status("PENDING", resource="notes/x.txt"),
                          review_status("APPROVED", resource="notes/x.txt", reviewer="sagar"))
    gateway.verdict = verdict("REVIEW", finding)
    with caplog.at_level(logging.DEBUG):
        async with proxy(root, gateway, output(secret_out), wait=90) as (client, _, _):
            await client.call_tool("write_file", {"path": "notes/x.txt", "content": secret_arg})
            await client.call_tool("read_text_file", {"path": "../escape", "content": secret_arg})
    logged = caplog.text
    assert "notes/x.txt" in logged  # resources and decisions are logged ...
    for forbidden in (secret_arg, secret_out, TOKEN, API_KEY):  # ... their arguments, outputs and secrets never
        assert forbidden not in logged
