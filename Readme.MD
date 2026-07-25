

# SETUP First
Put the given files, in the root of directory, i.e. where package.json exists and run:

`npm install`

and type this to Start dev server: `npm run start`


# GITHUB

Ensure you have uptodate code before you start : 
>- `git pull`

Please Ensure these stuffs are done every time you make major changes to code. 
>- `git add *`
>- `git commit -m "Some changes"`
>- `git push`



## Public API Routes

These routes can be accessed without authentication. They are intended for displaying information to the public or for accepting user-submitted content.

*   **Blog Posts:**
    *   **/getBlogs**: Fetches a list of published blog posts with truncated excerpts. Supports pagination using `limit` (number of posts per page) and `offset` (starting index) query parameters. Example: `/getBlogs?limit=5&offset=10`.
    *   **/getBlogs/:id**: Fetches a single, published blog post by its ID. Example: `/getBlogs/123`.

*   **Board of Directors:**
    *   **/api/directors**: Retrieves a list of all board members (name, position, department, hierarchical ID, image URL, and alt text).

*   **Products:**
     *   **/api/products**: Retrieves a list of all products

*   **Contact Details:**
    *   **/api/dynamicContactDetails**: Retrieves the details of the currently active contact. This is intended to be used in the footer or contact page of the website.

*   **Contact Messages:**
    *   **/api/message (POST)**: Allows users to submit messages (e.g., contact form submissions). This route *creates* a new message. Intended to be used at contact-form of the website.

*   **Notices and Popups:**
    *   **/api/popupMessages/active**: Retrieves a list of currently active popup messages. These messages are intended to be displayed to users on the website.

*   **Reports/Publications:**
    *   **/api/publications**: Retrieves a list of all publications (books, yearly reports, etc.).