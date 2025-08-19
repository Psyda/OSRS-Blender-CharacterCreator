import bpy
import threading
import socket
import json
import time
import traceback
from bpy.types import PropertyGroup, Operator
from bpy.props import StringProperty, IntProperty, BoolProperty, CollectionProperty

from . import importer

# Global server instance
_server_thread = None
_server_socket = None
_server_running = False

class ImportedItem(PropertyGroup):
    """Property group to track imported items"""
    name: StringProperty(name="Item Name")
    item_id: IntProperty(name="Item ID")
    model_type: StringProperty(name="Model Type")
    timestamp: StringProperty(name="Import Time")
    object_count: IntProperty(name="Object Count")

class CacheExplorerProperties(PropertyGroup):
    """Properties for the Cache Explorer addon"""
    server_port: IntProperty(
        name="Port",
        description="Port for the Blender server to listen on",
        default=8889,
        min=1024,
        max=65535
    )
    
    server_running: BoolProperty(
        name="Server Running",
        description="Whether the server is currently running",
        default=False
    )
    
    auto_import: BoolProperty(
        name="Auto Import",
        description="Automatically import received models",
        default=True
    )
    
    create_collections: BoolProperty(
        name="Create Collections",
        description="Create collections for each imported item",
        default=True
    )
    
    status_message: StringProperty(
        name="Status",
        description="Current server status",
        default="Server not running"
    )
    
    imported_items: CollectionProperty(type=ImportedItem)

class CacheExplorerServer:
    """HTTP server to receive model data from web application"""
    
    def __init__(self, port):
        self.port = port
        self.socket = None
        self.running = False
        
    def start(self):
        """Start the server"""
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.bind(('localhost', self.port))
            self.socket.listen(5)
            self.running = True
            
            print(f"Cache Explorer server started on port {self.port}")
            self.update_status(f"Server listening on port {self.port}")
            
            while self.running:
                try:
                    conn, addr = self.socket.accept()
                    self.handle_request(conn, addr)
                except socket.error as e:
                    if self.running:  # Only print error if we're supposed to be running
                        print(f"Socket error: {e}")
                        
        except Exception as e:
            print(f"Server error: {e}")
            self.update_status(f"Server error: {str(e)}")
        finally:
            self.cleanup()
    
    def handle_request(self, conn, addr):
        """Handle incoming HTTP request"""
        try:
            print(f"New connection from {addr}")
            conn.settimeout(30.0)
            
            # Read the entire request in one go using a larger buffer
            all_data = b""
            header_complete = False
            content_length = 0
            
            # First, read until we have complete headers
            while not header_complete:
                try:
                    chunk = conn.recv(8192)  # Larger initial read
                    if not chunk:
                        print("Connection closed during header read")
                        return
                    all_data += chunk
                    
                    # Check for end of headers
                    if b'\r\n\r\n' in all_data:
                        header_complete = True
                        # Extract content length from headers
                        header_str = all_data[:all_data.find(b'\r\n\r\n')].decode('utf-8', errors='ignore')
                        for line in header_str.split('\n'):
                            if line.lower().startswith('content-length:'):
                                try:
                                    content_length = int(line.split(':')[1].strip())
                                    print(f"Found Content-Length: {content_length}")
                                    break
                                except ValueError:
                                    print("Invalid Content-Length header")
                                    return
                        break
                except socket.timeout:
                    print("Timeout reading headers")
                    return
                except Exception as e:
                    print(f"Error reading headers: {e}")
                    return
            
            if not header_complete:
                print("Failed to read complete headers")
                return
            
            # Find where the body starts
            header_end_pos = all_data.find(b'\r\n\r\n') + 4
            body_data = all_data[header_end_pos:]
            
            print(f"Headers complete. Content-Length: {content_length}, Body so far: {len(body_data)} bytes")
            
            # Continue reading until we have the complete body
            while len(body_data) < content_length:
                remaining = content_length - len(body_data)
                print(f"Need {remaining} more bytes")
                
                try:
                    # Read remaining data in larger chunks
                    chunk = conn.recv(min(remaining, 16384))  # 16KB chunks
                    if not chunk:
                        print("Connection closed while reading body")
                        break
                    body_data += chunk
                    print(f"Progress: {len(body_data)}/{content_length} bytes")
                except socket.timeout:
                    print(f"Timeout - have {len(body_data)}/{content_length} bytes")
                    break
                except Exception as e:
                    print(f"Error reading body: {e}")
                    break
            
            print(f"Final body size: {len(body_data)} bytes (expected {content_length})")
            
            if len(body_data) != content_length:
                error_msg = f"Incomplete body: got {len(body_data)}, expected {content_length}"
                print(error_msg)
                self.send_error_response(conn, error_msg)
                return
            
            # Process based on request type
            request_line = all_data[:all_data.find(b'\r\n')].decode('utf-8', errors='ignore')
            print(f"Request: {request_line}")
            
            if 'POST /import' in request_line:
                # Decode the complete body
                try:
                    body_str = body_data.decode('utf-8')
                    print(f"Body decoded successfully: {len(body_str)} characters")
                    
                    # Validate the JSON by checking if it ends properly
                    if not body_str.strip().endswith('}'):
                        print(f"Warning: JSON doesn't end with }}, ends with: '{body_str[-10:]}'")
                    
                except UnicodeDecodeError as e:
                    print(f"Unicode decode error: {e}")
                    self.send_error_response(conn, f"Unicode decode error: {str(e)}")
                    return
                
                # Parse and handle the model data
                try:
                    print("Parsing JSON...")
                    model_data = json.loads(body_str)
                    item_name = model_data.get('metadata', {}).get('itemName', 'Unknown')
                    print(f"Successfully parsed JSON for: {item_name}")
                    
                    # Process the import
                    self.handle_model_import(model_data)
                    self.send_success_response(conn)
                    
                except json.JSONDecodeError as e:
                    error_msg = f"JSON parse error at position {e.pos}: {e.msg}"
                    print(error_msg)
                    if len(body_str) > e.pos:
                        context_start = max(0, e.pos - 30)
                        context_end = min(len(body_str), e.pos + 30)
                        print(f"Context around error: '{body_str[context_start:context_end]}'")
                        print(f"Full JSON length: {len(body_str)}")
                        print(f"JSON ends with: '{body_str[-50:]}'")
                    self.send_error_response(conn, f"Invalid JSON: {e.msg}")
                    
                except Exception as e:
                    print(f"Import error: {e}")
                    import traceback
                    traceback.print_exc()
                    self.send_error_response(conn, f"Import error: {str(e)}")
                    
            elif 'OPTIONS' in request_line:
                self.send_cors_response(conn)
                
            elif 'GET /status' in request_line:
                self.send_status_response(conn)
                
            else:
                self.send_not_found_response(conn)
            
        except Exception as e:
            print(f"Request handling error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            try:
                conn.close()
            except:
                pass
    
    def send_success_response(self, conn):
        """Send success response"""
        response_body = '{"status": "success"}'
        response = f"HTTP/1.1 200 OK\r\n"
        response += "Access-Control-Allow-Origin: *\r\n"
        response += "Content-Type: application/json\r\n"
        response += f"Content-Length: {len(response_body)}\r\n"
        response += "\r\n"
        response += response_body
        conn.send(response.encode('utf-8'))
    
    def send_error_response(self, conn, error_message):
        """Send error response"""
        error_data = {"status": "error", "message": error_message}
        response_body = json.dumps(error_data)
        response = f"HTTP/1.1 400 Bad Request\r\n"
        response += "Access-Control-Allow-Origin: *\r\n"
        response += "Content-Type: application/json\r\n"
        response += f"Content-Length: {len(response_body)}\r\n"
        response += "\r\n"
        response += response_body
        conn.send(response.encode('utf-8'))
    
    def send_cors_response(self, conn):
        """Send CORS preflight response"""
        response = "HTTP/1.1 200 OK\r\n"
        response += "Access-Control-Allow-Origin: *\r\n"
        response += "Access-Control-Allow-Methods: POST, OPTIONS\r\n"
        response += "Access-Control-Allow-Headers: Content-Type\r\n"
        response += "Content-Length: 0\r\n"
        response += "\r\n"
        conn.send(response.encode('utf-8'))
    
    def send_status_response(self, conn):
        """Send status response"""
        try:
            status_data = {
                "status": "running",
                "port": self.port,
                "imported_count": len(bpy.context.scene.cache_explorer.imported_items) if hasattr(bpy.context.scene, 'cache_explorer') else 0
            }
            response_body = json.dumps(status_data)
            response = f"HTTP/1.1 200 OK\r\n"
            response += "Access-Control-Allow-Origin: *\r\n"
            response += "Content-Type: application/json\r\n"
            response += f"Content-Length: {len(response_body)}\r\n"
            response += "\r\n"
            response += response_body
            conn.send(response.encode('utf-8'))
        except Exception as e:
            print(f"Error sending status: {e}")
            self.send_error_response(conn, str(e))
    
    def send_not_found_response(self, conn):
        """Send 404 response"""
        response = "HTTP/1.1 404 Not Found\r\n"
        response += "Access-Control-Allow-Origin: *\r\n"
        response += "Content-Length: 0\r\n"
        response += "\r\n"
        conn.send(response.encode('utf-8'))
    
    def handle_model_import(self, model_data):
        """Handle importing received model data"""
        def import_in_main_thread():
            try:
                # Ensure we have a valid context
                if not hasattr(bpy.context.scene, 'cache_explorer'):
                    self.update_status("Error: Cache Explorer properties not found")
                    return None
                    
                props = bpy.context.scene.cache_explorer
                
                if props.auto_import:
                    # Import the model using our existing importer
                    imported_objects = importer.import_model_data(model_data, props.create_collections)
                    
                    # Track the import
                    metadata = model_data.get('metadata', {})
                    item = props.imported_items.add()
                    item.name = metadata.get('itemName', 'Unknown Item')
                    item.item_id = metadata.get('itemId', 0)
                    item.model_type = metadata.get('modelType', 'unknown')
                    item.timestamp = time.strftime('%H:%M:%S')
                    item.object_count = len(imported_objects)
                    
                    self.update_status(f"Imported {item.name} ({len(imported_objects)} objects)")
                    print(f"Successfully imported {item.name}")
                else:
                    self.update_status("Received model data (auto-import disabled)")
                    
            except Exception as e:
                error_msg = f"Import error: {str(e)}"
                self.update_status(error_msg)
                print(error_msg)
                print(traceback.format_exc())
            
            # Return None to unregister the timer (one-shot execution)
            return None
        
        # Schedule import in main thread - use a safer approach for Blender 4.4+
        try:
            if hasattr(bpy.app.timers, 'register'):
                bpy.app.timers.register(import_in_main_thread, first_interval=0.1)
            else:
                # Fallback for older Blender versions
                import_in_main_thread()
        except Exception as e:
            print(f"Timer registration error: {e}")
            # Try direct execution as fallback
            try:
                import_in_main_thread()
            except Exception as e2:
                print(f"Direct execution also failed: {e2}")
    
    def update_status(self, message):
        """Update status message in main thread"""
        def update_in_main_thread():
            try:
                if hasattr(bpy.context.scene, 'cache_explorer'):
                    bpy.context.scene.cache_explorer.status_message = message
            except Exception as e:
                print(f"Status update error: {e}")
            return None
        
        try:
            if hasattr(bpy.app.timers, 'register'):
                bpy.app.timers.register(update_in_main_thread, first_interval=0.05)
            else:
                update_in_main_thread()
        except Exception as e:
            print(f"Status timer error: {e}")
            try:
                update_in_main_thread()
            except:
                pass
    
    def stop(self):
        """Stop the server"""
        self.running = False
        if self.socket:
            try:
                self.socket.close()
            except:
                pass
    
    def cleanup(self):
        """Clean up resources"""
        self.running = False
        if self.socket:
            try:
                self.socket.close()
            except:
                pass
        self.socket = None

class CACHE_OT_start_server(Operator):
    """Start the Cache Explorer server"""
    bl_idname = "cache.start_server"
    bl_label = "Start Server"
    bl_description = "Start listening for models from Cache Explorer web app"
    
    def execute(self, context):
        global _server_thread, _server_socket, _server_running
        
        props = context.scene.cache_explorer
        
        if props.server_running:
            self.report({'WARNING'}, "Server is already running")
            return {'CANCELLED'}
        
        try:
            # Create and start server
            server_instance = CacheExplorerServer(props.server_port)
            
            _server_thread = threading.Thread(target=server_instance.start, daemon=True)
            _server_thread.start()
            
            # Store references
            _server_socket = server_instance
            _server_running = True
            props.server_running = True
            
            self.report({'INFO'}, f"Server started on port {props.server_port}")
            
        except Exception as e:
            self.report({'ERROR'}, f"Failed to start server: {str(e)}")
            return {'CANCELLED'}
        
        return {'FINISHED'}

class CACHE_OT_stop_server(Operator):
    """Stop the Cache Explorer server"""
    bl_idname = "cache.stop_server"
    bl_label = "Stop Server"
    bl_description = "Stop the Cache Explorer server"
    
    def execute(self, context):
        global _server_thread, _server_socket, _server_running
        
        props = context.scene.cache_explorer
        
        if not props.server_running:
            self.report({'WARNING'}, "Server is not running")
            return {'CANCELLED'}
        
        try:
            stop_server()
            props.server_running = False
            props.status_message = "Server stopped"
            self.report({'INFO'}, "Server stopped")
            
        except Exception as e:
            self.report({'ERROR'}, f"Error stopping server: {str(e)}")
            return {'CANCELLED'}
        
        return {'FINISHED'}

class CACHE_OT_clear_imports(Operator):
    """Clear the imported items list"""
    bl_idname = "cache.clear_imports"
    bl_label = "Clear Import History"
    bl_description = "Clear the list of imported items"
    
    def execute(self, context):
        props = context.scene.cache_explorer
        props.imported_items.clear()
        self.report({'INFO'}, "Import history cleared")
        return {'FINISHED'}

def stop_server():
    """Stop the server (called from addon unregister)"""
    global _server_thread, _server_socket, _server_running
    
    if _server_socket:
        _server_socket.stop()
        _server_socket = None
    
    _server_running = False
    
    if _server_thread and _server_thread.is_alive():
        _server_thread.join(timeout=1.0)
    
    _server_thread = None