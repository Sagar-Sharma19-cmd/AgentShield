package com.agentshield.inspection;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ChecksumsTest {

    @Test
    void luhn() {
        assertTrue(Checksums.luhn("4111111111111111"));
        assertTrue(Checksums.luhn("378282246310005"));
        assertTrue(Checksums.luhn("79927398713"));
        assertFalse(Checksums.luhn("79927398710"));
        assertFalse(Checksums.luhn("4111111111111112"));
        assertFalse(Checksums.luhn(""));
        assertFalse(Checksums.luhn("4111-1111"), "digits only");
    }

    @Test
    void verhoeff() {
        assertTrue(Checksums.verhoeff("2363"), "textbook example: 236 with check digit 3");
        assertFalse(Checksums.verhoeff("2364"));
        assertTrue(Checksums.verhoeff("234123412346"));
        assertFalse(Checksums.verhoeff("234123412347"));
        assertFalse(Checksums.verhoeff("234123412364"), "Verhoeff catches transpositions");
        assertFalse(Checksums.verhoeff(""));
    }

    @Test
    void shannonEntropy() {
        assertEquals(0.0, Checksums.shannonEntropy("aaaaaaaa"), 1e-9);
        assertEquals(1.0, Checksums.shannonEntropy("abababab"), 1e-9);
        assertEquals(3.0, Checksums.shannonEntropy("abcdefgh"), 1e-9);
        assertTrue(Checksums.shannonEntropy("changeme") < GenericSecretDetector.MIN_ENTROPY);
        assertTrue(Checksums.shannonEntropy(TestSecrets.HIGH_ENTROPY_PASSWORD) >= GenericSecretDetector.MIN_ENTROPY);
        assertEquals(0.0, Checksums.shannonEntropy(""), 1e-9);
    }

    @Test
    void digitsOnly() {
        assertEquals("41111111", Checksums.digitsOnly("4111 1111"));
    }
}
