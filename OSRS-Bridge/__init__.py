bl_info = {
    "name": "OSRS-Bridge",
    "author": "Psyda",
    "version": (1, 1, 0),
    "blender": (3, 5, 0),
    "location": "View3D > Sidebar > Cache Explorer",
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

def register():
    # Register property groups in correct order (dependencies first)
    bpy.utils.register_class(server.ImportedItem)
    bpy.utils.register_class(server.CacheExplorerProperties)
    bpy.types.Scene.cache_explorer = PointerProperty(type=server.CacheExplorerProperties)
    
    # Register operators
    bpy.utils.register_class(server.CACHE_OT_start_server)
    bpy.utils.register_class(server.CACHE_OT_stop_server)
    bpy.utils.register_class(server.CACHE_OT_clear_imports)
    
    # Register UI panels
    bpy.utils.register_class(ui.CACHE_PT_main_panel)
    bpy.utils.register_class(ui.CACHE_PT_server_panel)
    bpy.utils.register_class(ui.CACHE_PT_imports_panel)
    bpy.utils.register_class(ui.CACHE_PT_support_panel) # Register the new panel
    
    print("Cache Explorer Bridge addon registered")

def unregister():
    # Stop server if running
    if bpy.context.scene and hasattr(bpy.context.scene, 'cache_explorer'):
        props = bpy.context.scene.cache_explorer
        if props and props.server_running:
            server.stop_server()
    
    # Unregister in reverse order
    bpy.utils.unregister_class(ui.CACHE_PT_support_panel) # Unregister the new panel
    bpy.utils.unregister_class(ui.CACHE_PT_imports_panel)
    bpy.utils.unregister_class(ui.CACHE_PT_server_panel)
    bpy.utils.unregister_class(ui.CACHE_PT_main_panel)
    
    bpy.utils.unregister_class(server.CACHE_OT_clear_imports)
    bpy.utils.unregister_class(server.CACHE_OT_stop_server)
    bpy.utils.unregister_class(server.CACHE_OT_start_server)
    
    # Check before deleting property to avoid errors on reload
    if hasattr(bpy.types.Scene, 'cache_explorer'):
        del bpy.types.Scene.cache_explorer

    bpy.utils.unregister_class(server.CacheExplorerProperties)
    bpy.utils.unregister_class(server.ImportedItem)
    
    print("Cache Explorer Bridge addon unregistered")

if __name__ == "__main__":
    register()