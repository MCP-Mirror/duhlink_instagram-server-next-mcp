import { McpError, ErrorCode } from '../types/mcp.js';
// JSON-RPC error codes
const RPC_ERROR_CODES = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
};
/**
 * Map MCP error codes to JSON-RPC error codes
 */
const ERROR_CODE_MAP = {
    [ErrorCode.InvalidRequest]: RPC_ERROR_CODES.INVALID_REQUEST,
    [ErrorCode.InvalidParams]: RPC_ERROR_CODES.INVALID_PARAMS,
    [ErrorCode.MethodNotFound]: RPC_ERROR_CODES.METHOD_NOT_FOUND,
    [ErrorCode.InternalError]: RPC_ERROR_CODES.INTERNAL_ERROR,
};
/**
 * StdioServerTransport implementation for MCP
 * Handles communication over standard input/output using JSON-RPC 2.0
 */
export class StdioServerTransport {
    constructor() {
        this.isConnected = false;
        this.messageBuffer = '';
        this.server = null;
    }
    /**
     * Connect to stdin/stdout
     */
    async connect() {
        console.error('DEBUG: StdioServerTransport connecting...');
        if (this.isConnected) {
            console.error('DEBUG: StdioServerTransport already connected');
            return;
        }
        if (!this.server) {
            console.error('DEBUG: No server instance set on transport');
            throw new Error('Server not set');
        }
        try {
            // Set up stdin handling
            console.error('DEBUG: Setting up stdin handling...');
            process.stdin.setEncoding('utf8');
            process.stdin.on('data', (chunk) => {
                console.error('DEBUG: Received stdin data:', chunk);
                const data = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
                this.handleInput(data);
            });
            // Handle stdin errors
            process.stdin.on('error', (error) => {
                console.error('DEBUG: Stdin error:', error);
            });
            // Handle stdin end
            process.stdin.on('end', () => {
                console.error('DEBUG: Stdin ended');
                this.close();
            });
            process.stdin.resume();
            console.error('DEBUG: Stdin resumed');
            this.isConnected = true;
            console.error('DEBUG: StdioServerTransport connected successfully');
            // Send initial connection message after setting isConnected
            const connectionMessage = {
                jsonrpc: '2.0',
                id: 'connection',
                result: {
                    status: 'connected',
                    server: this.server.getConfig().name,
                    version: this.server.getConfig().version
                }
            };
            process.stdout.write(JSON.stringify(connectionMessage, null, 2) + '\n');
        }
        catch (error) {
            console.error('DEBUG: Error connecting StdioServerTransport:', error);
            throw error;
        }
    }
    /**
     * Close the transport
     */
    async close() {
        console.error('DEBUG: StdioServerTransport closing...');
        if (!this.isConnected) {
            console.error('DEBUG: StdioServerTransport already closed');
            return;
        }
        try {
            // Send disconnect message before closing
            if (this.server) {
                const disconnectMessage = {
                    jsonrpc: '2.0',
                    id: 'connection',
                    result: {
                        status: 'disconnected',
                        server: this.server.getConfig().name
                    }
                };
                process.stdout.write(JSON.stringify(disconnectMessage, null, 2) + '\n');
            }
            process.stdin.pause();
            process.stdin.removeAllListeners('data');
            process.stdin.removeAllListeners('error');
            process.stdin.removeAllListeners('end');
            this.isConnected = false;
            this.server = null;
            this.messageBuffer = '';
            console.error('DEBUG: StdioServerTransport closed successfully');
        }
        catch (error) {
            console.error('DEBUG: Error closing StdioServerTransport:', error);
            throw error;
        }
    }
    /**
     * Set the server instance
     */
    setServer(server) {
        console.error('DEBUG: Setting server on StdioServerTransport');
        this.server = server;
    }
    /**
     * Handle input from stdin
     */
    handleInput(chunk) {
        console.error('DEBUG: Processing input chunk');
        this.messageBuffer += chunk;
        // Process complete messages
        let newlineIndex;
        while ((newlineIndex = this.messageBuffer.indexOf('\n')) !== -1) {
            const message = this.messageBuffer.slice(0, newlineIndex);
            this.messageBuffer = this.messageBuffer.slice(newlineIndex + 1);
            console.error('DEBUG: Processing message:', message);
            try {
                const request = JSON.parse(message);
                console.error('DEBUG: Parsed JSON-RPC request:', request);
                this.handleRequest(request).catch(error => {
                    console.error('DEBUG: Error handling request:', error);
                    this.sendError(request.id, RPC_ERROR_CODES.INTERNAL_ERROR, error instanceof Error ? error.message : String(error));
                });
            }
            catch (error) {
                console.error('DEBUG: Error parsing message:', error);
                this.sendError(null, RPC_ERROR_CODES.PARSE_ERROR, 'Parse error');
            }
        }
    }
    /**
     * Handle a JSON-RPC request
     */
    async handleRequest(request) {
        console.error('DEBUG: Handling JSON-RPC request:', request);
        if (!this.server) {
            console.error('DEBUG: No server instance available');
            this.sendError(request.id, RPC_ERROR_CODES.INTERNAL_ERROR, 'Server not initialized');
            return;
        }
        try {
            // Validate JSON-RPC request
            if (request.jsonrpc !== '2.0') {
                throw new McpError(ErrorCode.InvalidRequest, 'Invalid JSON-RPC version');
            }
            // Find handler for method
            console.error('DEBUG: Looking for handler for method:', request.method);
            const handler = this.server.getHandler(request.method);
            if (!handler) {
                throw new McpError(ErrorCode.MethodNotFound, `Method not found: ${request.method}`);
            }
            // Execute handler
            console.error('DEBUG: Executing handler for method:', request.method);
            const result = await handler(request.params);
            console.error('DEBUG: Handler execution successful');
            this.sendResult(request.id, result);
        }
        catch (error) {
            console.error('DEBUG: Error in request handling:', error);
            if (error instanceof McpError) {
                const code = ERROR_CODE_MAP[error.code] || RPC_ERROR_CODES.INTERNAL_ERROR;
                this.sendError(request.id, code, error.message);
            }
            else {
                console.error('DEBUG: Non-MCP error:', error);
                this.sendError(request.id, RPC_ERROR_CODES.INTERNAL_ERROR, error instanceof Error ? error.message : String(error));
            }
        }
    }
    /**
     * Send a successful response
     */
    sendResult(id, result) {
        console.error('DEBUG: Sending successful response for id:', id);
        const response = {
            jsonrpc: '2.0',
            id,
            result
        };
        this.send(response);
    }
    /**
     * Send an error response
     */
    sendError(id, code, message, data) {
        console.error('DEBUG: Sending error response:', { id, code, message, data });
        const response = {
            jsonrpc: '2.0',
            id: id ?? 0,
            error: {
                code,
                message,
                data
            }
        };
        this.send(response);
    }
    /**
     * Send a message over stdout
     */
    send(message) {
        if (!this.isConnected) {
            console.error('DEBUG: Cannot send message - transport not connected');
            throw new Error('Transport not connected');
        }
        try {
            const messageStr = JSON.stringify(message, null, 2);
            console.error('DEBUG: Sending message:', messageStr);
            process.stdout.write(messageStr + '\n');
        }
        catch (error) {
            console.error('DEBUG: Error sending message:', error);
            throw error;
        }
    }
}
//# sourceMappingURL=stdio.js.map