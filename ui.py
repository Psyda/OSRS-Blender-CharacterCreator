import bpy
from bpy.types import Panel

class OSRS_PT_main_panel(Panel):
    """Main OSRS Bridge panel"""
    bl_label = "OSRS Bridge"
    bl_idname = "OSRS_PT_main_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "OSRS Bridge"
    
    def draw(self, context):
        layout = self.layout
        
        # Header
        row = layout.row(align=True)
        row.label(text="RuneScape Cache Explorer", icon='MESH_MONKEY')
        
        layout.separator()
        
        # Instructions
        box = layout.box()
        col = box.column(align=True)
        col.label(text="Instructions:", icon='INFO')
        col.label(text="1. Start the server in the panel below.")
        col.label(text="2. Use the web app to send models.")
        col.label(text="3. Models will import automatically.")

class OSRS_PT_update_panel(Panel):
    """Update notification panel"""
    bl_label = "Updates"
    bl_idname = "OSRS_PT_update_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "OSRS Bridge"
    bl_parent_id = "OSRS_PT_main_panel"
    bl_options = {'DEFAULT_CLOSED'}
    
    @classmethod
    def poll(cls, context):
        # Only show if update system is available and either update is available or user wants to check
        return (hasattr(context.scene, 'osrs_bridge') and 
                context.scene.osrs_bridge.check_updates_enabled)
    
    def draw(self, context):
        layout = self.layout
        props = context.scene.osrs_bridge
        
        # Update available notification
        if props.update_available and not props.update_dismissed:
            # Prominent update notification
            box = layout.box()
            box.alert = True  # Makes the box red/prominent
            
            col = box.column(align=True)
            row = col.row(align=True)
            row.label(text="Update Available!", icon='INFO')
            row.operator("osrs.dismiss_update", text="", icon='X', emboss=False)
            
            col.separator(factor=0.5)
            col.label(text=f"Version {props.update_version} is now available")
            
            # Action buttons
            row = col.row(align=True)
            row.operator("osrs.view_changelog", text="What's New?", icon='TEXT')
            row.operator("wm.url_open", text="Download", icon='IMPORT').url = "https://github.com/Psyda/OSRS-Blender-CharacterCreator/releases/latest"
            
        else:
            # Regular update check section
            box = layout.box()
            col = box.column(align=True)
            
            # Current version info
            from . import bl_info
            current_version = ".".join(map(str, bl_info["version"]))
            col.label(text=f"Current Version: v{current_version}", icon='CHECKMARK')
            
            # Update check controls
            row = col.row(align=True)
            row.operator("osrs.check_updates", text="Check for Updates", icon='FILE_REFRESH')
            
            # Settings
            col.separator(factor=0.5)
            col.prop(props, "check_updates_enabled", text="Auto-check for updates")
            
            # Last check info
            if props.last_update_check > 0:
                import time
                check_time = time.strftime("%H:%M", time.localtime(props.last_update_check))
                col.label(text=f"Last checked: {check_time}", icon='TIME')

class OSRS_PT_server_panel(Panel):
    """Server control panel"""
    bl_label = "Server Control"
    bl_idname = "OSRS_PT_server_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "OSRS Bridge"
    bl_parent_id = "OSRS_PT_main_panel"
    bl_options = {'DEFAULT_CLOSED'}
    
    def draw(self, context):
        layout = self.layout
        props = context.scene.osrs_bridge
        
        # Server Status and Control
        box = layout.box()
        col = box.column()
        
        # Status Label
        row = col.row(align=True)
        if props.server_running:
            row.label(text="Status: Connected", icon='LINKED')
        else:
            row.label(text="Status: Disconnected", icon='UNLINKED')
        
        # Start/Stop Button
        row = col.row(align=True)
        if props.server_running:
            row.operator("osrs.stop_server", text="Stop Server", icon='PAUSE')
        else:
            row.operator("osrs.start_server", text="Start Server", icon='PLAY')
        
        # Connection Info
        if props.server_running:
            col.separator()
            info_box = col.box()
            info_col = info_box.column(align=True)
            info_col.label(text="Connection Info:", icon='NETWORK_DRIVE')
            info_col.label(text=f"Listening on: localhost:{props.server_port}")
        
        # Settings
        layout.separator()
        box = layout.box()
        col = box.column(align=True)
        col.label(text="Settings:", icon='SETTINGS')
        col.prop(props, "server_port", text="Port")
        col.prop(props, "auto_import", text="Auto Import Models")
        col.prop(props, "create_collections", text="Create Collections per Character")

        # Status Log
        layout.separator()
        box = layout.box()
        col = box.column(align=True)
        col.label(text="Log:", icon='TEXT')
        
        # Split long status messages
        status = props.status_message
        words = status.split(' ')
        lines = []
        current_line = ""
        for word in words:
            if len(current_line + " " + word) > 35:
                if current_line: lines.append(current_line)
                current_line = word
            else:
                current_line += (" " + word) if current_line else word
        if current_line: lines.append(current_line)
        
        for line in lines:
            col.label(text=line)

class OSRS_PT_imports_panel(Panel):
    """Import history panel"""
    bl_label = "Import History"
    bl_idname = "OSRS_PT_imports_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "OSRS Bridge"
    bl_parent_id = "OSRS_PT_main_panel"
    bl_options = {'DEFAULT_CLOSED'}
    
    def draw(self, context):
        layout = self.layout
        props = context.scene.osrs_bridge
        
        # Header with clear button
        row = layout.row(align=True)
        row.label(text=f"Recent Imports ({len(props.imported_items)})")
        if len(props.imported_items) > 0:
            row.operator("osrs.clear_imports", text="", icon='TRASH')
        
        layout.separator()
        
        if len(props.imported_items) == 0:
            layout.label(text="No models imported yet.", icon='INFO')
        else:
            box = layout.box()
            for i, item in enumerate(reversed(props.imported_items)):
                if i >= 10:
                    if len(props.imported_items) > 10:
                        layout.label(text=f"... and {len(props.imported_items) - 10} more")
                    break
                
                row = box.row(align=True)
                row.label(text=f"{item.name} ({item.model_type})", icon='MESH_DATA')
                row.label(text=f"{item.timestamp}", icon='TIME')
                if i < 9 and i < len(props.imported_items) - 1:
                    box.separator(factor=0.5)

class OSRS_PT_support_panel(Panel):
    """About and Support panel"""
    bl_label = "About & Support"
    bl_idname = "OSRS_PT_support_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "OSRS Bridge"
    bl_parent_id = "OSRS_PT_main_panel"
    
    def draw(self, context):
        layout = self.layout
        
        box = layout.box()
        col = box.column(align=True)
        
        col.label(text="Developed by: Psyda")
        col.separator()
        
        # Link Buttons
        row = col.row(align=True)
        row.operator("wm.url_open", text="GitHub", icon='URL').url = "https://github.com/Psyda/OSRS-Blender-CharacterCreator" 
        row.operator("wm.url_open", text="Patreon", icon='FUND').url = "https://www.patreon.com/c/psyda"
        
        col.separator()
        
        # Support Message
        col.label(text="Support for more creative projects")
        col.label(text="and active updates is appreciated!")
        
        col.separator(factor=2.0)
        
        # Tips section
        col.label(text="Tips:", icon='QUESTION')
        tips_box = col.box()
        tips_col = tips_box.column(align=True)
        tips_col.label(text="• Imported objects have vertex groups.")
        tips_col.label(text="• Meshes are parented to an armature.")
        tips_col.label(text="• Colors use a custom HSL colormap.")
