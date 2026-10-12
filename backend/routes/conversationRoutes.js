const express = require("express");
const db = require("../db");

const router = express.Router();

router.use(express.json());

// Create a new conversation
router.post("/", (req, res) => {
    const userId = req.body.userId || "demo-user";
    const title = req.body.title || "New Conversation";

    db.run(
        `
        INSERT INTO Conversations
        (user_id, title)
        VALUES (?, ?)
        `,
        [userId, title],
        function (err) {
            if (err) {
                console.error(
                    "Conversation creation error:",
                    err.message
                );

                return res.status(500).json({
                    success: false,
                    message: "Unable to create conversation."
                });
            }

            res.status(201).json({
                success: true,
                conversation: {
                    id: this.lastID,
                    userId,
                    title
                }
            });
        }
    );
});

// Get previous conversations for a user
router.get("/", (req, res) => {
    const userId = req.query.userId || "demo-user";

    db.all(
        `
        SELECT
            id,
            user_id,
            title,
            created_at,
            updated_at
        FROM Conversations
        WHERE user_id = ?
        ORDER BY updated_at DESC
        `,
        [userId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Unable to load conversations."
                });
            }

            res.json({
                success: true,
                conversations: rows
            });
        }
    );
});

// Rename a conversation
router.patch("/:id", (req, res) => {
    const conversationId = req.params.id;
    const title = req.body.title;

    if (!title || !title.trim()) {
        return res.status(400).json({
            success: false,
            message: "Conversation title is required."
        });
    }

    db.run(
        `
        UPDATE Conversations
        SET title = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [title.trim(), conversationId],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Unable to rename conversation."
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Conversation not found."
                });
            }

            res.json({
                success: true,
                message: "Conversation renamed successfully.",
                conversation: {
                    id: Number(conversationId),
                    title: title.trim()
                }
            });
        }
    );
});

// Get messages for one conversation
router.get("/:id/messages", (req, res) => {
    const conversationId = req.params.id;

    db.all(
        `
        SELECT
            id,
            conversation_id,
            role,
            content,
            grounded,
            response_time_ms,
            created_at
        FROM Messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC, id ASC
        `,
        [conversationId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Unable to load messages."
                });
            }

            res.json({
                success: true,
                messages: rows
            });
        }
    );
});

// Delete a conversation
router.delete("/:id", (req, res) => {
    const conversationId = req.params.id;

    db.run(
        `
        DELETE FROM MessageSources
        WHERE message_id IN (
            SELECT id
            FROM Messages
            WHERE conversation_id = ?
        )
        `,
        [conversationId],
        (sourceError) => {
            if (sourceError) {
                return res.status(500).json({
                    success: false,
                    message: "Unable to delete message sources."
                });
            }

            db.run(
                `
                DELETE FROM Messages
                WHERE conversation_id = ?
                `,
                [conversationId],
                (messageError) => {
                    if (messageError) {
                        return res.status(500).json({
                            success: false,
                            message: "Unable to delete messages."
                        });
                    }

                    db.run(
                        `
                        DELETE FROM Conversations
                        WHERE id = ?
                        `,
                        [conversationId],
                        function (conversationError) {
                            if (conversationError) {
                                return res.status(500).json({
                                    success: false,
                                    message:
                                        "Unable to delete conversation."
                                });
                            }

                            if (this.changes === 0) {
                                return res.status(404).json({
                                    success: false,
                                    message: "Conversation not found."
                                });
                            }

                            res.json({
                                success: true,
                                message:
                                    "Conversation deleted successfully."
                            });
                        }
                    );
                }
            );
        }
    );
});

module.exports = router;