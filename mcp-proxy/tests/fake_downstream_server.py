"""A tiny stdio MCP server used as the proxy's downstream in process-level tests. Its output holds a marker string."""

import anyio
import mcp_types as types
from mcp.server import Server
from mcp.server.stdio import stdio_server

OUTPUT_MARKER = "DOWNSTREAM-OUTPUT-MARKER"


async def on_list_tools(ctx, params):
    return types.ListToolsResult(tools=[types.Tool(name="read_text_file", input_schema={
        "type": "object", "properties": {"path": {"type": "string"}}})])


async def on_call_tool(ctx, params):
    return types.CallToolResult(content=[types.TextContent(text=OUTPUT_MARKER)])


async def main():
    server = Server("fake-downstream", on_list_tools=on_list_tools, on_call_tool=on_call_tool)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


anyio.run(main)
