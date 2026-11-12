package com.agentshield.inspection;

import java.util.HashMap;
import java.util.Map;

/** Luhn (card numbers), Verhoeff (Aadhaar) and Shannon entropy. Pure functions. */
public final class Checksums {

    private static final int[][] VERHOEFF_D = {
            {0, 1, 2, 3, 4, 5, 6, 7, 8, 9}, {1, 2, 3, 4, 0, 6, 7, 8, 9, 5}, {2, 3, 4, 0, 1, 7, 8, 9, 5, 6},
            {3, 4, 0, 1, 2, 8, 9, 5, 6, 7}, {4, 0, 1, 2, 3, 9, 5, 6, 7, 8}, {5, 9, 8, 7, 6, 0, 4, 3, 2, 1},
            {6, 5, 9, 8, 7, 1, 0, 4, 3, 2}, {7, 6, 5, 9, 8, 2, 1, 0, 4, 3}, {8, 7, 6, 5, 9, 3, 2, 1, 0, 4},
            {9, 8, 7, 6, 5, 4, 3, 2, 1, 0}};
    private static final int[][] VERHOEFF_P = {
            {0, 1, 2, 3, 4, 5, 6, 7, 8, 9}, {1, 5, 7, 6, 2, 8, 3, 0, 9, 4}, {5, 8, 0, 3, 7, 9, 6, 1, 4, 2},
            {8, 9, 1, 6, 0, 4, 3, 5, 2, 7}, {9, 4, 5, 3, 1, 2, 6, 8, 7, 0}, {4, 2, 8, 6, 5, 7, 3, 9, 0, 1},
            {2, 7, 9, 3, 8, 0, 6, 4, 1, 5}, {7, 0, 4, 6, 9, 1, 3, 2, 5, 8}};

    private Checksums() {
    }

    /** Luhn check over a string of digits only. */
    public static boolean luhn(String digits) {
        int sum = 0;
        boolean doubleIt = false;
        for (int i = digits.length() - 1; i >= 0; i--) {
            char c = digits.charAt(i);
            if (c < '0' || c > '9') {
                return false;
            }
            int d = c - '0';
            if (doubleIt) {
                d *= 2;
                if (d > 9) {
                    d -= 9;
                }
            }
            sum += d;
            doubleIt = !doubleIt;
        }
        return !digits.isEmpty() && sum % 10 == 0;
    }

    /** Verhoeff check over a string of digits only (the last digit is the check digit). */
    public static boolean verhoeff(String digits) {
        int c = 0;
        int n = digits.length();
        for (int i = 0; i < n; i++) {
            char ch = digits.charAt(n - 1 - i);
            if (ch < '0' || ch > '9') {
                return false;
            }
            c = VERHOEFF_D[c][VERHOEFF_P[i % 8][ch - '0']];
        }
        return n > 0 && c == 0;
    }

    /** Shannon entropy in bits per character. */
    public static double shannonEntropy(String value) {
        if (value.isEmpty()) {
            return 0;
        }
        Map<Integer, Integer> counts = new HashMap<>();
        value.codePoints().forEach(cp -> counts.merge(cp, 1, Integer::sum));
        int length = (int) value.codePoints().count();
        double entropy = 0;
        for (int count : counts.values()) {
            double p = (double) count / length;
            entropy -= p * (Math.log(p) / Math.log(2));
        }
        return entropy;
    }

    /** Keeps only the digits. */
    public static String digitsOnly(String value) {
        StringBuilder sb = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c >= '0' && c <= '9') {
                sb.append(c);
            }
        }
        return sb.toString();
    }
}
