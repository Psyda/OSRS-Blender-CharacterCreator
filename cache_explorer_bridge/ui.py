import bpy
from bpy.types import Panel

class CACHE_PT_main_panel(Panel):
    """Main Cache Explorer panel"""
    bl_label = "Cache Explorer Bridge"
    bl_idname = "CACHE_PT_main_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Cache Explorer"
    
    def draw(self, context):
        layout = self.layout
        props = context.scene.cache_explorer
        
        # Header
        row = layout.row()
        row.label(text="RuneScape Cache Explorer", icon='MESH_MONKEY')
        
        layout.separator()
        
        # Quick info
        box = layout.box()
        col = box.column(align=True)
        col.label(text="Quick Setup:", icon='INFO')
        col.label(text="1. Start server below")
        col.label(text="2. Use web app to send models")
        col.label(text="3. Models import automatically")
        
        layout.separator()
        
        # Status
        row = layout.row()
        if props.server_running:
            row.alert = False
            row.label(text="🟢 Connected", icon='LINKED')
        else:
            row.alert = True
            row.label(text="🔴 Disconnected", icon='UNLINKED')

class CACHE_PT_server_panel(Panel):
    """Server control panel"""
    bl_label = "Server Control"
    bl_idname = "CACHE_PT_server_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Cache Explorer"
    bl_parent_id = "CACHE_PT_main_panel"
    
    def draw(self, context):
        layout = self.layout
        props = context.scene.cache_explorer
        
        # Server settings
        col = layout.column(align=True)
        col.label(text="Server Settings:")
        col.prop(props, "server_port")
        
        layout.separator()
        
        # Server control buttons
        row = layout.row(align=True)
        if props.server_running:
            row.operator("cache.stop_server", text="Stop Server", icon='PAUSE')
            row.enabled = True
        else:
            row.operator("cache.start_server", text="Start Server", icon='PLAY')
        
        layout.separator()
        
        # Import settings
        box = layout.box()
        col = box.column(align=True)
        col.label(text="Import Settings:", icon='IMPORT')
        col.prop(props, "auto_import", text="Auto Import Models")
        col.prop(props, "create_collections", text="Create Collections")
        
        layout.separator()
        
        # Status message
        box = layout.box()
        col = box.column(align=True)
        col.label(text="Status:", icon='INFO')
        
        # Split long status messages
        status = props.status_message
        if len(status) > 30:
            words = status.split(' ')
            lines = []
            current_line = ""
            for word in words:
                if len(current_line + " " + word) > 30:
                    if current_line:
                        lines.append(current_line)
                    current_line = word
                else:
                    current_line = current_line + " " + word if current_line else word
            if current_line:
                lines.append(current_line)
            
            for line in lines:
                col.label(text=line)
        else:
            col.label(text=status)
        
        # Connection info when running
        if props.server_running:
            layout.separator()
            box = layout.box()
            col = box.column(align=True)
            col.label(text="Connection Info:", icon='NETWORK_DRIVE')
            col.label(text=f"Listening on: localhost:{props.server_port}")
            col.label(text="Web app will connect automatically")

class CACHE_PT_imports_panel(Panel):
    """Import history panel"""
    bl_label = "Import History"
    bl_idname = "CACHE_PT_imports_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Cache Explorer"
    bl_parent_id = "CACHE_PT_main_panel"
    
    def draw(self, context):
        layout = self.layout
        props = context.scene.cache_explorer
        
        # Header with clear button
        row = layout.row()
        row.label(text=f"Imported Items ({len(props.imported_items)}):")
        if len(props.imported_items) > 0:
            row.operator("cache.clear_imports", text="", icon='TRASH')
        
        layout.separator()
        
        if len(props.imported_items) == 0:
            box = layout.box()
            col = box.column(align=True)
            col.label(text="No imports yet", icon='INFO')
            col.label(text="Start server and use web app")
            col.label(text="to send models to Blender")
        else:
            # Show imported items
            for i, item in enumerate(reversed(props.imported_items)):
                box = layout.box()
                col = box.column(align=True)
                
                # Item name and ID
                row = col.row()
                row.label(text=item.name, icon='MESH_DATA')
                row.label(text=f"#{item.item_id}")
                
                # Details
                row = col.row()
                row.label(text=f"Type: {item.model_type}")
                row.label(text=f"Objects: {item.object_count}")
                
                # Timestamp
                col.label(text=f"Imported: {item.timestamp}", icon='TIME')
                
                # Limit display to last 10 imports
                if i >= 9:
                    if len(props.imported_items) > 10:
                        layout.label(text=f"... and {len(props.imported_items) - 10} more")
                    break
        
        layout.separator()
        
        # Tips
        box = layout.box()
        col = box.column(align=True)
        col.label(text="Tips:", icon='QUESTION')
        col.label(text="• Objects have vertex groups")
        col.label(text="• Colors use HSL colormap")
        col.label(text="• Check outliner for collections")
        col.label(text="• Metadata stored in object properties")