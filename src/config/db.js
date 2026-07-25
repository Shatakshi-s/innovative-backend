import { createClient } from "@libsql/client";


export const getTursoClient = (env) => {
    return createClient({
        url: env.TURSO_URL,
        authToken: env.TURSO_AUTH_TOKEN,
    }
    );
};
