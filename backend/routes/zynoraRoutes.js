const express = require("express");
const { searchKnowledge } = require("../services/zynoraRagService");
const db = require("../db");

const router = express.Router();

router.use(express.json());

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
}

function getRows(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

async function saveEvaluation(data) {
    await runQuery(
        `INSERT INTO AIResponseEvaluations
        (
            conversation_id,
            message_id,
            question,
            retrieved_chunks,
            relevance_score,
            answer,
            source,
            response_time_ms,
            grounded,
            confidence
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            data.conversationId,
            data.messageId,
            data.question,
            data.retrievedChunks,
            data.relevanceScore,
            data.answer,
            data.source,
            data.responseTimeMs,
            data.grounded ? 1 : 0,
            data.confidence
        ]
    );
}

router.post("/chat", async (req, res) => {
    const startTime = Date.now();

    try {
        console.log("Zynora request body:", req.body);

        const message = req.body?.message?.trim();
        const conversationId = req.body?.conversationId;

        if (!message) {
            return res.status(400).json({
                success: false,
                message: "Question is required."
            });
        }

        if (!conversationId) {
            return res.status(400).json({
                success: false,
                message: "conversationId is required."
            });
        }

        const conversations = await getRows(
            `SELECT id
             FROM Conversations
             WHERE id = ?`,
            [conversationId]
        );

        if (conversations.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found."
            });
        }

        await runQuery(
            `INSERT INTO Messages
             (conversation_id, role, content, grounded, response_time_ms)
             VALUES (?, 'user', ?, 0, NULL)`,
            [conversationId, message]
        );

        const previousMessages = await getRows(
            `SELECT role, content, grounded
             FROM Messages
             WHERE conversation_id = ?
             ORDER BY created_at ASC, id ASC`,
            [conversationId]
        );

        const conversationContext = previousMessages
            .slice(-6)
            .map(item => `${item.role}: ${item.content}`)
            .join("\n");

        console.log("Conversation context:", conversationContext);

        // First search the user's actual question.
        let results = await searchKnowledge(message);

        /*
         * Only use previous grounded context for clear follow-up questions.
         * New independent questions must never reuse the previous answer.
         */
        const isContextualFollowUp =
            /\b(this|that|it|information|chatbot|above|previous|they|them)\b/i.test(
                message
            );

        if (results.length === 0 && isContextualFollowUp) {
            const lastGroundedMessage = [...previousMessages]
                .reverse()
                .find(
                    item =>
                        item.role === "assistant" &&
                        item.grounded === 1
                );

            if (lastGroundedMessage) {
                results = await searchKnowledge(
                    lastGroundedMessage.content
                );
            }
        }

        const responseTime = Date.now() - startTime;

        /*
         * No approved knowledge found.
         */
        if (results.length === 0) {
            const answer =
                "I couldn't find this information in the approved Zyngram knowledge base.";

            const assistantMessage = await runQuery(
                `INSERT INTO Messages
                 (conversation_id, role, content, grounded, response_time_ms)
                 VALUES (?, 'assistant', ?, 0, ?)`,
                [
                    conversationId,
                    answer,
                    responseTime
                ]
            );

            await saveEvaluation({
                conversationId,
                messageId: assistantMessage.lastID,
                question: message,
                retrievedChunks: 0,
                relevanceScore: 0,
                answer,
                source: null,
                responseTimeMs: responseTime,
                grounded: false,
                confidence: 0
            });

            await runQuery(
                `UPDATE Conversations
                 SET updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [conversationId]
            );

            return res.json({
                success: true,
                answer,
                sources: [],
                grounded: false,
                conversationId,
                messageId: assistantMessage.lastID,
                responseTimeMs: responseTime
            });
        }

        /*
         * Approved knowledge was found.
         */
        const best = results[0];

        const assistantMessage = await runQuery(
            `INSERT INTO Messages
             (conversation_id, role, content, grounded, response_time_ms)
             VALUES (?, 'assistant', ?, 1, ?)`,
            [
                conversationId,
                best.content,
                responseTime
            ]
        );

        for (const item of results) {
            await runQuery(
                `INSERT INTO MessageSources
                 (
                     message_id,
                     title,
                     category,
                     version,
                     source,
                     relevance_score
                 )
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    assistantMessage.lastID,
                    item.title,
                    item.category,
                    item.version,
                    item.source,
                    item.relevanceScore
                ]
            );
        }

        await saveEvaluation({
            conversationId,
            messageId: assistantMessage.lastID,
            question: message,
            retrievedChunks: results.length,
            relevanceScore: best.relevanceScore,
            answer: best.content,
            source: best.source,
            responseTimeMs: responseTime,
            grounded: true,
            confidence: Math.min(
                1,
                best.relevanceScore / 10
            )
        });

        await runQuery(
            `UPDATE Conversations
             SET updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [conversationId]
        );

        return res.json({
            success: true,
            answer: best.content,
            sources: results.map(item => ({
                title: item.title,
                category: item.category,
                version: item.version,
                source: item.source,
                relevanceScore: item.relevanceScore
            })),
            grounded: true,
            conversationId,
            messageId: assistantMessage.lastID,
            responseTimeMs: responseTime
        });

    } catch (error) {
        console.error("Zynora chat error:", error);

        return res.status(500).json({
            success: false,
            message: "Zynora service error."
        });
    }
});

module.exports = router;