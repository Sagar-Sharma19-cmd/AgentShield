package com.agentshield.inspection;

import java.util.regex.Pattern;

/** A PEM private key header: -----BEGIN [RSA |EC |OPENSSH |ENCRYPTED ...]PRIVATE KEY-----. SECRET. */
public class PrivateKeyDetector extends RegexDetector {

    static final Pattern PATTERN = Pattern.compile("-----BEGIN (?:[A-Z0-9]{1,20} ){0,3}PRIVATE KEY-----");

    public PrivateKeyDetector() {
        super("private-key", FindingCategory.SECRET, "PRIVATE_KEY", PATTERN);
    }
}
