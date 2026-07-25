const bcrypt = require('bcryptjs'); // Use bcryptjs for hashing passwords
const jwt = require('jsonwebtoken'); // Use jsonwebtoken for creating JWT tokens
const xss = require('xss'); // npm install xss


async function signup(request, dbClient) {
    try {
        // 1. Extract and Validate User Data
        const { username, email, password, phone_number, role, first_name, last_name } = await request.json();

        if (!username || !email || !password) {
            return new Response(JSON.stringify({ error: "Missing required fields: username, email, and password." }, null, 2), { status: 400, headers: { "Content-Type": "application/json" } });
        }

        if (!isValidEmail(email)) {
            return new Response(JSON.stringify({ error: "Invalid email format." }, null, 2), { status: 400, headers: { "Content-Type": "application/json" } });
        }

        function isValidEmail(email) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        }

        // 2. Sanitize Inputs (Prevent XSS)
        const sanitizedUsername = xss(username);
        const sanitizedEmail = xss(email);
        const sanitizedPhoneNumber = phone_number ? xss(phone_number) : null;
        const sanitizedRole = role ? xss(role) : 'user';
        const sanitizedFirstName = first_name ? xss(first_name) : null;
        const sanitizedLastName = last_name ? xss(last_name) : null;

        // 3. Check for Existing User (Username/Email)
        let existingUserResult;
        try {
            const existingUserQuery = `SELECT id FROM Users WHERE username = ? OR email = ?`;

            console.log("signup: Checking for existing user with query:", existingUserQuery);

            try {
                existingUserResult = await dbClient.execute(existingUserQuery, [sanitizedUsername, sanitizedEmail]);
                console.log("signup: executeDbQuery: Query executed successfully. Result:", existingUserResult);
            } catch (executeDbQueryError) {
                console.error("signup: executeDbQuery: Database query failed:", executeDbQueryError);
                throw executeDbQueryError;
            }

            if (existingUserResult && existingUserResult.results && existingUserResult.results.length > 0) {
                return new Response(JSON.stringify({ error: "Username or email already exists." }, null, 2), { status: 409, headers: { "Content-Type": "application/json" } });
            }
        } catch (dbError) {
            console.error("signup: Error checking for existing user:", dbError);
            return new Response(JSON.stringify({ error: "Database error checking for existing user.", details: dbError.message || String(dbError) }, null, 2), { status: 500, headers: { "Content-Type": "application/json" } });
        }

        // 4. Hash Password
        let hashedPassword;
        try {
            hashedPassword = await bcrypt.hash(password, 12);
        } catch (hashError) {
            console.error("signup: Password hashing error:", hashError);
            return new Response(JSON.stringify({ error: "Error hashing password.", details: hashError.message || String(hashError) }, null, 2), { status: 500, headers: { "Content-Type": "application/json" } });
        }

        // 5. Insert New User
        try {
            const insertUserQuery = `
                INSERT INTO Users (username, email, phone_number, password, role, first_name, last_name)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            console.log("signup: Inserting new user with query:", insertUserQuery);

            try {
                await dbClient.execute(insertUserQuery, [sanitizedUsername, sanitizedEmail, sanitizedPhoneNumber, hashedPassword, sanitizedRole, sanitizedFirstName, sanitizedLastName]);
                console.log("signup: executeDbQuery: Query executed successfully.");
            } catch (executeDbQueryError) {
                console.error("signup: executeDbQuery: Database query failed:", executeDbQueryError);
                throw executeDbQueryError;
            }

        } catch (dbInsertError) {
            console.error("signup: Error inserting new user:", dbInsertError);
            return new Response(JSON.stringify({ error: "Failed to create user in database.", details: dbInsertError.message || String(dbInsertError) }, null, 2), { status: 500, headers: { "Content-Type": "application/json" } });
        }

        // 6. Success!
        return new Response(JSON.stringify({ message: "User created successfully!" }, null, 2), { status: 201, headers: { "Content-Type": "application/json" } });

    } catch (error) {
        console.error("signup: General signup error:", error);
        return new Response(JSON.stringify({ error: "Failed to create user.", details: error.message || String(error) }, null, 2), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}

async function login(request, dbClient, env) {
    try {
        // Extract login credentials from request
        console.log(request)
        const { username, email, password } = await request.json();

        // Validate required fields
        if ((!username && !email) || !password) {
            return new Response(JSON.stringify({
                error: "Missing required fields: username/email or password."
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Build query dynamically based on provided field (username or email)
        const query = username
            ? 'SELECT * FROM Users WHERE username = ?'
            : 'SELECT * FROM Users WHERE email = ?';
        const identifier = username || email;

        // Query database for the user
        const result = await dbClient.execute(query, [identifier]);

        // Check if the user exists
        if (result.rows.length === 0) {
            return new Response(JSON.stringify({
                error: "User not found"
            }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Compare the provided password with the stored hashed password
        const user = result.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return new Response(JSON.stringify({
                error: "Invalid password"
            }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Generate a JWT token
        const token = jwt.sign(
            { userId: user.id, username: user.username, role: user.role },
            env.JWT_SECRET,
            { expiresIn: env.JWT_EXPIRY } // Token expiration time (e.g. s, h, m )
        );

        // Successful login response
        return new Response(JSON.stringify({
            message: "Login successful",
            token,
            userId: user.id,
            username: user.username,
            role: user.role
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });

    } catch (error) {
        // Handle any server error
        return new Response(JSON.stringify({
            error: "Login failed",
            details: error.message,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}

module.exports = { login, signup };