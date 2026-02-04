class ApiError extends Error {
    constructor(
        statusCode,
        message = "Something went wrong",
        errors = [],
        stack = ""
    ) {
        super(message); // Calls the original Error constructor
        this.statusCode = statusCode;
        this.data = null; // We set this to null because this is an Error, not a Response
        this.message = message;
        this.success = false; // Always false because it's an error!
        this.errors = errors;

        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
