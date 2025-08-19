bl_info = {
    "name": "RuneScape Cache Explorer Bridge",
    "author": "Cache Explorer Team",
    "version": (1, 0, 0),
    "blender": (3, 5, 0),
    "location": "View3D > Sidebar > Cache Explorer",
    "description": "Receives RuneScape cache models directly from Cache Explorer web app",
    "category": "Import-Export",
    "support": "COMMUNITY"
}

import bpy
import bmesh
import json
import math
import threading
import socket
import time
import traceback
from mathutils import Vector
from bpy.props import StringProperty, IntProperty, BoolProperty
from bpy.types import Operator, Panel, PropertyGroup

# Import our modules
from . import server
from . import importer
from . import ui

def register():
    # Register property groups in correct order (dependencies first)
    bpy.utils.register_class(server.ImportedItem)
    bpy.utils.register_class(server.CacheExplorerProperties)
    bpy.types.Scene.cache_explorer = bpy.props.PointerProperty(type=server.CacheExplorerProperties)
    
    # Register operators
    bpy.utils.register_class(server.CACHE_OT_start_server)
    bpy.utils.register_class(server.CACHE_OT_stop_server)
    bpy.utils.register_class(server.CACHE_OT_clear_imports)
    
    # Register UI panels
    bpy.utils.register_class(ui.CACHE_PT_main_panel)
    bpy.utils.register_class(ui.CACHE_PT_server_panel)
    bpy.utils.register_class(ui.CACHE_PT_imports_panel)
    
    print("Cache Explorer Bridge addon registered")

def unregister():
    # Stop server if running
    if hasattr(bpy.types.Scene, 'cache_explorer'):
        props = bpy.context.scene.cache_explorer
        if props.server_running:
            server.stop_server()
    
    # Unregister in reverse order
    bpy.utils.unregister_class(ui.CACHE_PT_imports_panel)
    bpy.utils.unregister_class(ui.CACHE_PT_server_panel)
    bpy.utils.unregister_class(ui.CACHE_PT_main_panel)
    
    bpy.utils.unregister_class(server.CACHE_OT_clear_imports)
    bpy.utils.unregister_class(server.CACHE_OT_stop_server)
    bpy.utils.unregister_class(server.CACHE_OT_start_server)
    
    bpy.utils.unregister_class(server.CacheExplorerProperties)
    bpy.utils.unregister_class(server.ImportedItem)
    
    if hasattr(bpy.types.Scene, 'cache_explorer'):
        del bpy.types.Scene.cache_explorer
    
    print("Cache Explorer Bridge addon unregistered")

if __name__ == "__main__":
    register()