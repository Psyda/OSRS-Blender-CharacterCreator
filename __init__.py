bl_info = {
    "name": "OSRS-Bridge",
    "author": "Psyda",
    "version": (1, 2, 0),
    "blender": (3, 5, 0),
    "location": "View3D > Sidebar > OSRS Bridge",
    "description": "Receives RuneScape cache models directly from Cache Explorer web app",
    "category": "Import-Export",
    "support": "https://github.com/Psyda/OSRS-Blender-CharacterCreator"
}

import bpy
from bpy.props import PointerProperty

# Import our modules
from . import server
from . import importer
from . import ui
from . import update_checker

def register():
    # Register property groups in correct order (dependencies first)
    bpy.utils.register_class(server.ImportedItem)
    bpy.utils.register_class(server.OSRSBridgeProperties)
    bpy.types.Scene.osrs_bridge = PointerProperty(type=server.OSRSBridgeProperties)
    
    # Register operators
    bpy.utils.register_class(server.OSRS_OT_start_server)
    bpy.utils.register_class(server.OSRS_OT_stop_server)
    bpy.utils.register_class(server.OSRS_OT_clear_imports)
    
    # Register update checker
    update_checker.register_update_checker()
    
    # Register UI panels
    bpy.utils.register_class(ui.OSRS_PT_main_panel)
    bpy.utils.register_class(ui.OSRS_PT_update_panel)
    bpy.utils.register_class(ui.OSRS_PT_server_panel)
    bpy.utils.register_class(ui.OSRS_PT_imports_panel)
    bpy.utils.register_class(ui.OSRS_PT_support_panel)
    
    print("OSRS Bridge addon registered")

def unregister():
    # Stop server if running
    if bpy.context.scene and hasattr(bpy.context.scene, 'osrs_bridge'):
        props = bpy.context.scene.osrs_bridge
        if props and props.server_running:
            server.stop_server()
    
    # Unregister in reverse order
    bpy.utils.unregister_class(ui.OSRS_PT_support_panel)
    bpy.utils.unregister_class(ui.OSRS_PT_imports_panel)
    bpy.utils.unregister_class(ui.OSRS_PT_server_panel)
    bpy.utils.unregister_class(ui.OSRS_PT_update_panel)
    bpy.utils.unregister_class(ui.OSRS_PT_main_panel)
    
    # Unregister update checker
    update_checker.unregister_update_checker()
    
    bpy.utils.unregister_class(server.OSRS_OT_clear_imports)
    bpy.utils.unregister_class(server.OSRS_OT_stop_server)
    bpy.utils.unregister_class(server.OSRS_OT_start_server)
    
    # Check before deleting property to avoid errors on reload
    if hasattr(bpy.types.Scene, 'osrs_bridge'):
        del bpy.types.Scene.osrs_bridge

    bpy.utils.unregister_class(server.OSRSBridgeProperties)
    bpy.utils.unregister_class(server.ImportedItem)
    
    print("OSRS Bridge addon unregistered")

if __name__ == "__main__":
    register()