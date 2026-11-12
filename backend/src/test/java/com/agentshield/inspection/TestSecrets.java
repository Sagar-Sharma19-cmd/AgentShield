package com.agentshield.inspection;

/**
 * Fake, well-known example values for the detector tests. They are assembled from pieces so this source file
 * never contains a complete token-shaped string that a secret scanner would flag on push. None of them is a real
 * credential: the AWS pair is AWS's documented example, the rest are made up.
 */
final class TestSecrets {

    static final String AWS_ACCESS_KEY = "AKIA" + "IOSFODNN7EXAMPLE";
    static final String AWS_TEMP_KEY = "ASIA" + "IOSFODNN7EXAMPLE";
    static final String AWS_SECRET_KEY = "wJalrXUtnFEMI/K7MDENG/" + "bPxRfiCYEXAMPLEKEY";
    static final String PEM_HEADER = "-----BEGIN RSA " + "PRIVATE KEY-----";
    static final String GITHUB_PAT = "ghp" + "_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
    static final String GITHUB_OAUTH = "gho" + "_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
    static final String GITHUB_FINE_GRAINED = "github" + "_pat_" + "11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz";
    static final String SLACK_TOKEN = "xox" + "b-" + "123456789012-abcdefghijkl";
    static final String STRIPE_LIVE = "sk_" + "live_" + "4eC39HqLyjWDarjtT1zdp7dc";
    static final String STRIPE_TEST = "sk_" + "test_" + "4eC39HqLyjWDarjtT1zdp7dc";
    static final String GOOGLE_API_KEY = "AIza" + "SyDabcdefghijklmnopqrstuvwxyz012345";
    static final String JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" + "." + "eyJzdWIiOiIxMjM0NTY3ODkwIn0" + "."
            + "c2lnbmF0dXJlLXZhbHVl";
    static final String HIGH_ENTROPY_PASSWORD = "Xk9#mP2$" + "vL7qZ4!w";

    static final String EMAIL = "alice" + "@" + "example.com";
    static final String CARD = "4111 1111 1111 1111";
    static final String PAN = "ABCPE1234F";
    static final String AADHAAR = "2341 2341 2346";
    static final String PHONE = "+919876543210";

    private TestSecrets() {
    }
}
