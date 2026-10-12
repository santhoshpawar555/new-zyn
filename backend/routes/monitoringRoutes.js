const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/summary", (req, res) => {
    const queries = {
        conversations: `
            SELECT COUNT(*) AS count
            FROM Conversations
        `,

        questions: `
            SELECT COUNT(*) AS count
            FROM Messages
            WHERE role = 'user'
        `,

        successfulAnswers: `
            SELECT COUNT(*) AS count
            FROM Messages
            WHERE role = 'assistant'
            AND grounded = 1
        `,

        noAnswers: `
            SELECT COUNT(*) AS count
            FROM Messages
            WHERE role = 'assistant'
            AND grounded = 0
        `,

        averageResponseTime: `
            SELECT ROUND(AVG(response_time_ms), 2) AS average
            FROM Messages
            WHERE role = 'assistant'
            AND response_time_ms IS NOT NULL
        `,

        categories: `
            SELECT category, COUNT(*) AS count
            FROM KnowledgeDocuments
            WHERE status = 'APPROVED'
            GROUP BY category
            ORDER BY count DESC
        `,

        evaluations: `
            SELECT COUNT(*) AS count
            FROM AIResponseEvaluations
        `
    };

    db.serialize(() => {
        db.get(queries.conversations, [], (conversationError, conversationRow) => {
            if (conversationError) {
                return res.status(500).json({
                    success: false,
                    message: "Unable to load monitoring data."
                });
            }

            db.get(queries.questions, [], (questionError, questionRow) => {
                if (questionError) {
                    return res.status(500).json({
                        success: false,
                        message: "Unable to load monitoring data."
                    });
                }

                db.get(
                    queries.successfulAnswers,
                    [],
                    (successError, successRow) => {
                        if (successError) {
                            return res.status(500).json({
                                success: false,
                                message: "Unable to load monitoring data."
                            });
                        }

                        db.get(
                            queries.noAnswers,
                            [],
                            (noAnswerError, noAnswerRow) => {
                                if (noAnswerError) {
                                    return res.status(500).json({
                                        success: false,
                                        message: "Unable to load monitoring data."
                                    });
                                }

                                db.get(
                                    queries.averageResponseTime,
                                    [],
                                    (timeError, timeRow) => {
                                        if (timeError) {
                                            return res.status(500).json({
                                                success: false,
                                                message:
                                                    "Unable to load monitoring data."
                                            });
                                        }

                                        db.all(
                                            queries.categories,
                                            [],
                                            (categoryError, categoryRows) => {
                                                if (categoryError) {
                                                    return res.status(500).json({
                                                        success: false,
                                                        message:
                                                            "Unable to load monitoring data."
                                                    });
                                                }

                                                db.get(
                                                    queries.evaluations,
                                                    [],
                                                    (evaluationError, evaluationRow) => {
                                                        if (evaluationError) {
                                                            return res.status(500).json({
                                                                success: false,
                                                                message:
                                                                    "Unable to load monitoring data."
                                                            });
                                                        }

                                                        res.json({
                                                            success: true,
                                                            monitoring: {
                                                                conversations:
                                                                    conversationRow.count,
                                                                questions:
                                                                    questionRow.count,
                                                                successfulAnswers:
                                                                    successRow.count,
                                                                noAnswers:
                                                                    noAnswerRow.count,
                                                                averageResponseTimeMs:
                                                                    timeRow.average || 0,
                                                                evaluations:
                                                                    evaluationRow.count,
                                                                categories:
                                                                    categoryRows
                                                            }
                                                        });
                                                    }
                                                );
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    }
                );
            });
        });
    });
});

module.exports = router;