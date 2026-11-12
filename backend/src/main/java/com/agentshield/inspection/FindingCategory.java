package com.agentshield.inspection;

/** What kind of sensitive content a finding is. SECRET is denied; PII and PROMPT_INJECTION go to review. */
public enum FindingCategory {
    SECRET,
    PII,
    PROMPT_INJECTION;

    /** The verdict a finding of this category produces on its own. */
    public InspectionVerdict verdict() {
        return this == SECRET ? InspectionVerdict.DENY : InspectionVerdict.REVIEW;
    }
}
