package com.agentshield.review;

import com.agentshield.dto.ReviewRequestResponse;
import com.agentshield.model.ReviewStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Administrative REST API for the Phase 3 human review workflow. Review requests are
 * created only by {@code GatewayService} when a gateway evaluation's final decision is
 * REVIEW; there is no endpoint to create one directly.
 */
@RestController
@RequestMapping("/api/v1/reviews")
public class ReviewRequestController {

    private final ReviewRequestService reviewRequestService;

    @Autowired
    public ReviewRequestController(ReviewRequestService reviewRequestService) {
        this.reviewRequestService = reviewRequestService;
    }

    @GetMapping("/{id}")
    public ResponseEntity<ReviewRequestResponse> getReview(@PathVariable UUID id) {
        return ResponseEntity.ok(ReviewRequestResponse.from(reviewRequestService.getReviewRequest(id)));
    }

    @GetMapping
    public ResponseEntity<List<ReviewRequestResponse>> listReviews(@RequestParam ReviewStatus status) {
        return ResponseEntity.ok(reviewRequestService.listByStatus(status).stream()
                .map(ReviewRequestResponse::from)
                .toList());
    }

    @PostMapping("/{id}/start")
    public ResponseEntity<ReviewRequestResponse> startReview(@PathVariable UUID id) {
        return ResponseEntity.ok(ReviewRequestResponse.from(reviewRequestService.startReview(id)));
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<ReviewRequestResponse> approveReview(@PathVariable UUID id) {
        return ResponseEntity.ok(ReviewRequestResponse.from(reviewRequestService.approveReview(id)));
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<ReviewRequestResponse> rejectReview(@PathVariable UUID id) {
        return ResponseEntity.ok(ReviewRequestResponse.from(reviewRequestService.rejectReview(id)));
    }
}
