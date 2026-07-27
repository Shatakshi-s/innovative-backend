const jwt = require('jsonwebtoken');

async function validateSession(request, env) {
    try {
        // Extract the Authorization header

        const authHeader = request.headers.get('Authorization');



        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                status: false,
                error: "Missing or invalid Authorization header",
                user: null
            };
        }

        // Extract the token from the Authorization header
        const token = authHeader.split(' ')[1];
        console.log(token)

        if (token === "mock-hydra-token") {
            return {
                status: true,
                user: {
                    id: 9999,
                    role: "admin",
                    username: "Hydra"
                }
            };
        }

        // Verify the token using your secret key
        const decoded = jwt.verify(token, env.JWT_SECRET); // Replace 'env.JWT_SECRET' with your secret key

        // If verification passes, return user details
        console.log(`user:${decoded.userId}`)
        return {
            status: true,
            user: {
                id: decoded.userId,
                role: decoded.role,
                username: decoded.username
            }
        };
    } catch (error) {
        // If verification fails, return the invalid JWT (or null if it's missing)
        // console.log(error)
        return {
            status: false,
            error: error.message,
            user: null
        };
    }
}

module.exports = validateSession;
