package com.agentshield.inspection;

import com.agentshield.exception.InvalidArgumentsException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.MissingNode;
import com.fasterxml.jackson.databind.node.NullNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ArgumentLimitsTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final ArgumentLimits limits = new ArgumentLimits(64, 3);

    @Test
    @DisplayName("Absent and JSON null mean no arguments")
    void absent() {
        assertNull(limits.prepare(null));
        assertNull(limits.prepare(NullNode.getInstance()));
        assertNull(limits.prepare(MissingNode.getInstance()));
    }

    @Test
    @DisplayName("Only a string, array or object is accepted")
    void type() throws Exception {
        assertThrows(InvalidArgumentsException.class, () -> limits.prepare(MAPPER.readTree("42")));
        assertThrows(InvalidArgumentsException.class, () -> limits.prepare(MAPPER.readTree("true")));
        limits.prepare(MAPPER.readTree("\"x\""));
        limits.prepare(MAPPER.readTree("[]"));
        limits.prepare(MAPPER.readTree("{}"));
    }

    @Test
    @DisplayName("Size limit counts canonical UTF-8 bytes; the message never contains the value")
    void size() throws Exception {
        String big = "\"" + "s".repeat(63) + "\"";
        InvalidArgumentsException e = assertThrows(InvalidArgumentsException.class,
                () -> limits.prepare(MAPPER.readTree(big)));
        assertEquals("arguments are 65 bytes as JSON; the limit is 64 bytes.", e.getMessage());
        assertFalse(e.getMessage().contains("sss"));
        limits.prepare(MAPPER.readTree("\"" + "s".repeat(62) + "\""));
    }

    @Test
    @DisplayName("Depth limit: [[[x]]] is 3 deep, [[[[x]]]] is too deep")
    void depth() throws Exception {
        limits.prepare(MAPPER.readTree("[[[\"x\"]]]"));
        InvalidArgumentsException e = assertThrows(InvalidArgumentsException.class,
                () -> limits.prepare(MAPPER.readTree("[[[[\"x\"]]]]")));
        assertTrue(e.getMessage().contains("nested more than 3 levels"));
        assertEquals(0, CanonicalJson.depth(JsonNodeFactory.instance.textNode("x"), 10));
        assertEquals(10, new ArgumentLimits(65536, 10).maxDepth(), "default depth in the brief");
    }

    @Test
    @DisplayName("The hash ignores key order and whitespace, and changes with any value")
    void canonicalHash() throws Exception {
        ArgumentLimits roomy = new ArgumentLimits(65536, 10);
        String a = roomy.prepare(MAPPER.readTree("{\"b\": [1, 2.50, \"x\"], \"a\": {\"d\": true, \"c\": null}}")).sha256();
        String b = roomy.prepare(MAPPER.readTree("{\"a\":{\"c\":null,\"d\":true},\"b\":[1,2.5,\"x\"]}")).sha256();
        String c = roomy.prepare(MAPPER.readTree("{\"a\":{\"c\":null,\"d\":true},\"b\":[1,2.5,\"y\"]}")).sha256();
        assertEquals(a, b);
        assertNotEquals(a, c);
        assertEquals("{\"a\":{\"c\":null,\"d\":true},\"b\":[1,2.5,\"x\"]}",
                CanonicalJson.write(MAPPER.readTree("{\"b\": [1, 2.50, \"x\"], \"a\": {\"d\": true, \"c\": null}}")));
        assertEquals(64, a.length());
    }

    @Test
    @DisplayName("toString never shows the arguments")
    void toStringRedacts() throws Exception {
        PreparedArguments prepared = new ArgumentLimits(65536, 10).prepare(MAPPER.readTree("[\"hunter2-password\"]"));
        assertFalse(prepared.toString().contains("hunter2"));
    }
}
