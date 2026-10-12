const db = require("../db");

function searchKnowledge(query) {
    return new Promise((resolve, reject) => {
        const normalizedQuery = query
            .toLowerCase()
            .replace(/[^\w\s]/g, "");

        /*
         * Zynora explanation questions
         */
        if (
            normalizedQuery.includes("zynora") &&
            (
                normalizedQuery.includes("explain") ||
                normalizedQuery.includes("what") ||
                normalizedQuery.includes("describe")
            )
        ) {
            const sql = `
                SELECT
                    id,
                    document_id,
                    title,
                    category,
                    section,
                    version,
                    source,
                    status,
                    content
                FROM KnowledgeChunks
                WHERE status = 'APPROVED'
                AND LOWER(content) LIKE '%zynora%'
            `;

            db.all(sql, [], (err, rows) => {
                if (err) {
                    return reject(err);
                }

                resolve(
                    rows.map(row => ({
                        ...row,
                        relevanceScore: 1
                    })).slice(0, 5)
                );
            });

            return;
        }

        /*
         * Franchise structure questions
         *
         * This handles questions such as:
         * "What information does Zyngram's franchise
         * structure contain?"
         */
        if (
            normalizedQuery.includes("franchise") &&
            (
                normalizedQuery.includes("structure") ||
                normalizedQuery.includes("levels") ||
                normalizedQuery.includes("hierarchy")
            )
        ) {
            const sql = `
                SELECT
                    id,
                    document_id,
                    title,
                    category,
                    section,
                    version,
                    source,
                    status,
                    content
                FROM KnowledgeChunks
                WHERE status = 'APPROVED'
                AND LOWER(content) LIKE '%franchise%'
                AND (
                    LOWER(content) LIKE '%physical%'
                    OR LOWER(content) LIKE '%digital%'
                )
            `;

            db.all(sql, [], (err, rows) => {
                if (err) {
                    return reject(err);
                }

                resolve(
                    rows.map(row => ({
                        ...row,
                        relevanceScore: 2
                    })).slice(0, 5)
                );
            });

            return;
        }

        const stopWords = new Set([
            "what",
            "is",
            "the",
            "a",
            "an",
            "of",
            "to",
            "for",
            "in",
            "on",
            "and",
            "or",
            "who",
            "how",
            "why",
            "when",
            "where",
            "does",
            "do",
            "can",
            "tell",
            "me",
            "about",
            "please",
            "name",
            "are",
            "were",
            "was",
            "this",
            "that",
            "which",
            "kinds",
            "kind",
            "through",
            "information",
            "contain",
            "contains",
            "all",
            "previous",
            "instructions",
            "ignore",
            "approved",
            "knowledge",
            "base",
            "answer",
            "from",
            "your",
            "own",
            "explain"
        ]);

        const keywordAliases = {
            levels: "hierarchy",
            level: "hierarchy",

            organized: "structure",
            organizes: "structure",
            organization: "structure",
            organizedly: "structure",

            services: "service",
            opportunities: "access",
            users: "user",

            find: "access"
        };

        const keywords = normalizedQuery
            .split(/\s+/)
            .map(word => keywordAliases[word] || word)
            .filter(
                word =>
                    word.length > 2 &&
                    !stopWords.has(word)
            );

        if (keywords.length === 0) {
            return resolve([]);
        }

        const conditions = keywords
            .map(() => "LOWER(content) LIKE ?")
            .join(" AND ");

        const values = keywords.map(
            word => `%${word}%`
        );

        const sql = `
            SELECT
                id,
                document_id,
                title,
                category,
                section,
                version,
                source,
                status,
                content
            FROM KnowledgeChunks
            WHERE status = 'APPROVED'
            AND (${conditions})
        `;

        db.all(sql, values, (err, rows) => {
            if (err) {
                return reject(err);
            }

            const ranked = rows.map(row => ({
                ...row,
                relevanceScore: keywords.length
            }));

            ranked.sort(
                (a, b) =>
                    b.relevanceScore -
                    a.relevanceScore
            );

            resolve(ranked.slice(0, 5));
        });
    });
}

module.exports = {
    searchKnowledge
};