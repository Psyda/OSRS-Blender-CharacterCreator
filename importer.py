import bpy
import bmesh
import json
import math
import time
import os
from mathutils import Vector

# Constants for Jagex HSL conversion
BRIGHTNESS_MAX = 0.6
HUE_OFFSET = 0.5 / 64
SATURATION_OFFSET = 0.5 / 8

def start_character_import(data):
    """
    Prepares for a new character import by creating a collection and importing the appropriate rig
    from 'rig.blend' based on the character's gender.
    """
    props = bpy.context.scene.osrs_bridge
    character_name = data.get('name', 'Character')
    
    # Determine character gender, defaulting to male if not specified.
    # Your app can send 'gender': 'female' or 'gender': 'male' in the data payload.
    gender = data.get('gender', 'male').lower()
    skeleton_name = "RuneScape_Skeleton_Female" if gender == 'female' else "RuneScape_Skeleton_Male"
    
    if props.create_collections:
        # Create a unique collection name to avoid conflicts
        collection_name = f"{character_name}_{int(time.time())}"
        new_collection = bpy.data.collections.new(collection_name)
        bpy.context.scene.collection.children.link(new_collection)
        props.active_collection_name = new_collection.name
        print(f"Created new collection for import: {collection_name}")
    else:
        # An empty name signifies using the scene's root collection
        props.active_collection_name = ""
        print("Importing directly into scene collection.")

    # --- Import the rig from rig.blend ---
    plugin_dir = os.path.dirname(__file__)
    rig_blend_path = os.path.join(plugin_dir, 'rig.blend')

    if os.path.exists(rig_blend_path):
        print(f"Found rig file at: {rig_blend_path}")
        print(f"Attempting to import skeleton: {skeleton_name}")
        
        try:
            # We use bpy.ops.wm.append to link the armature object from the .blend file
            with bpy.data.libraries.load(rig_blend_path, link=False) as (data_from, data_to):
                # Check if the skeleton object exists in the blend file
                if skeleton_name in data_from.objects:
                    data_to.objects = [skeleton_name]
                else:
                    print(f"Error: Could not find '{skeleton_name}' in {rig_blend_path}. Skipping rig import.")
                    return # Exit if the skeleton isn't found

            # The appended object should be in data_to.objects
            if data_to.objects:
                rig_object = data_to.objects[0]
                
                # Link the rig to the active collection
                active_collection = get_active_collection()
                active_collection.objects.link(rig_object)

                rig_object.name = f"{character_name}_Rig"
                print(f"Successfully imported and renamed rig to '{rig_object.name}'")
            else:
                 print("Failed to append the rig object from the .blend file.")

        except Exception as e:
            print(f"An error occurred while importing the rig: {e}")
            
    else:
        print(f"rig.blend not found at '{rig_blend_path}', skipping rig import.")


def end_character_import():
    """Finalizes the character import session by applying armature modifiers and parenting meshes to the rig."""
    props = bpy.context.scene.osrs_bridge
    active_collection = get_active_collection()
    
    # Find the rig in the collection
    rig_object = None
    for obj in active_collection.objects:
        if obj.type == 'ARMATURE':
            rig_object = obj
            break

    if rig_object:
        # Apply armature modifier and parent all mesh objects in the collection to the rig
        for obj in active_collection.objects:
            if obj.type == 'MESH':
                # Add the armature modifier so the mesh deforms with the rig
                modifier = obj.modifiers.new(name='Armature', type='ARMATURE')
                modifier.object = rig_object
                
                # Parent the mesh to the rig object
                obj.parent = rig_object
                
                print(f"Added armature modifier and parented {obj.name} to {rig_object.name}")

    print(f"Finished import for collection: {props.active_collection_name or 'Scene Collection'}")
    props.active_collection_name = ""


def get_active_collection():
    """Gets the collection designated for the current import session."""
    props = bpy.context.scene.osrs_bridge
    collection_name = props.active_collection_name
    
    if collection_name and collection_name in bpy.data.collections:
        return bpy.data.collections[collection_name]
    else:
        # Fallback to the scene's master collection if none is active
        return bpy.context.scene.collection

def unpack_hue(hsl):
    """Extract 6-bit hue from HSL value (bits 15-10)"""
    return (hsl >> 10) & 63

def unpack_saturation(hsl):
    """Extract 3-bit saturation from HSL value (bits 9-7)"""
    return (hsl >> 7) & 7

def unpack_luminance(hsl):
    """Extract 7-bit luminance from HSL value (bits 6-0)"""
    return hsl & 127

def adjust_for_brightness(rgb, brightness):
    """Apply gamma correction for brightness"""
    r = ((rgb >> 16) & 255) / 256.0
    g = ((rgb >> 8) & 255) / 256.0
    b = (rgb & 255) / 256.0
    
    r = pow(r, brightness)
    g = pow(g, brightness)
    b = pow(b, brightness)
    
    return (int(r * 256.0) << 16) | (int(g * 256.0) << 8) | int(b * 256.0)

def jagex_hsl_to_rgb(hsl_value, brightness=BRIGHTNESS_MAX):
    """Convert Jagex 16-bit HSL to RGB"""
    hue = unpack_hue(hsl_value) / 64.0 + HUE_OFFSET
    saturation = unpack_saturation(hsl_value) / 8.0 + SATURATION_OFFSET  
    luminance = unpack_luminance(hsl_value) / 128.0
    
    chroma = (1 - abs(2 * luminance - 1)) * saturation
    x = chroma * (1 - abs(((hue * 6) % 2) - 1))
    lightness = luminance - chroma / 2
    
    r, g, b = lightness, lightness, lightness
    
    hue_sector = int(hue * 6)
    if hue_sector == 0:
        r += chroma
        g += x
    elif hue_sector == 1:
        g += chroma
        r += x
    elif hue_sector == 2:
        g += chroma
        b += x
    elif hue_sector == 3:
        b += chroma
        g += x
    elif hue_sector == 4:
        b += chroma
        r += x
    else:
        r += chroma
        b += x
    
    rgb = (int(r * 256.0) << 16) | (int(g * 256.0) << 8) | int(b * 256.0)
    rgb = adjust_for_brightness(rgb, brightness)
    
    if rgb == 0:
        rgb = 1
    
    return rgb

def rgb_int_to_float_tuple(rgb_int):
    """Convert 24-bit RGB integer to (r, g, b) float tuple for Blender"""
    r = ((rgb_int >> 16) & 255) / 255.0
    g = ((rgb_int >> 8) & 255) / 255.0  
    b = (rgb_int & 255) / 255.0
    return (r, g, b)

def apply_color_overrides(face_colors, color_overrides):
    """Apply item color overrides to face colors"""
    if not color_overrides:
        return face_colors
    
    overridden_colors = []
    for color in face_colors:
        new_color = color_overrides.get(str(color), color)
        overridden_colors.append(new_color)
    
    return overridden_colors

def convert_coordinates(rs_pos):
    """Convert RuneScape coordinates to Blender coordinates"""
    return [
        rs_pos[0] / 100.0,
        rs_pos[2] / 100.0,
        -rs_pos[1] / 100.0
    ]

def generate_jagex_colormap():
    """Generate a colormap texture covering the entire Jagex HSL color space"""
    image_name = "Jagex_HSL_Colormap"
    if image_name in bpy.data.images:
        return bpy.data.images[image_name]
    
    width = 64 * 8  # 512 pixels
    height = 128    # 128 pixels
    
    img = bpy.data.images.new(image_name, width, height, alpha=False)
    
    pixels = []
    for y in range(height):
        luminance = y
        for x in range(width):
            hue = x % 64
            saturation = x // 64
            
            hsl_value = (hue << 10) | (saturation << 7) | luminance
            rgb_int = jagex_hsl_to_rgb(hsl_value)
            r, g, b = rgb_int_to_float_tuple(rgb_int)
            
            pixels.extend([r, g, b, 1.0])
    
    img.pixels = pixels
    img.pack()
    
    return img

def hsl_to_uv_coordinates(hsl_value):
    """Convert Jagex HSL value to UV coordinates on the colormap"""
    hue = unpack_hue(hsl_value)
    saturation = unpack_saturation(hsl_value)
    luminance = unpack_luminance(hsl_value)
    
    u = ((hue + saturation * 64) / 512.0) + 0.001
    v = (luminance / 128.0) + 0.004
    
    return (u, v)

def create_colormap_material(obj, face_colors):
    """Create a single material using the Jagex colormap texture"""
    if not face_colors:
        return
    
    material_name = "Jagex_HSL_Material"
    if material_name in bpy.data.materials:
        mat = bpy.data.materials[material_name]
    else:
        colormap_img = generate_jagex_colormap()
        
        mat = bpy.data.materials.new(name=material_name)
        mat.use_nodes = True
        mat.node_tree.nodes.clear()
        
        output_node = mat.node_tree.nodes.new(type='ShaderNodeOutputMaterial')
        bsdf_node = mat.node_tree.nodes.new(type='ShaderNodeBsdfPrincipled')
        tex_node = mat.node_tree.nodes.new(type='ShaderNodeTexImage')
        
        tex_node.image = colormap_img
        tex_node.interpolation = 'Closest'
        
        mat.node_tree.links.new(tex_node.outputs['Color'], bsdf_node.inputs['Base Color'])
        mat.node_tree.links.new(bsdf_node.outputs['BSDF'], output_node.inputs['Surface'])
        
        output_node.location = (400, 0)
        bsdf_node.location = (200, 0)
        tex_node.location = (0, 0)
        
        mat["jagex_colormap"] = True
    
    obj.data.materials.append(mat)
    
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="Jagex_Colors")
    
    uv_layer = obj.data.uv_layers.active.data
    
    for face_idx, color_val in enumerate(face_colors):
        if face_idx < len(obj.data.polygons):
            poly = obj.data.polygons[face_idx]
            u, v = hsl_to_uv_coordinates(color_val)
            
            for loop_idx in poly.loop_indices:
                uv_layer[loop_idx].uv = (u, v)

def create_vertex_groups(obj, vertex_groups):
    """Create vertex groups with bone assignments"""
    bone_names = {
        0: "Root", 1: "Head", 2: "Spine2", 3: "Spine3", 4: "Stomach", 5: "WaistBack",
        6: "Shoulder_R", 7: "Shoulder_L", 8: "Chest", 9: "Neck", 10: "UpperBack", 
        11: "MidBack", 12: "LowerBack", 13: "Bone_13", 14: "Bone_14", 15: "Cape_Flow",
        16: "Bone_16", 17: "Arm_R.001", 18: "Arm_R.002", 19: "Arm_R", 20: "Forearm_R", 21: "Arm_R.003",
        22: "Arm_L", 23: "Arm_L.001", 24: "Arm_L.002", 25: "Arm_L.003", 26: "Forearm_L", 27: "Hand_R",
        28: "Hand_L", 29: "Spine1", 30: "WaistFront", 31: "Leg_R.001", 32: "Leg_R.002",
        33: "Bone_33", 34: "Leg_R", 35: "Leg_L", 36: "Bone_36", 37: "Leg_L.001", 38: "Leg_L.002", 39: "Spine",
        40: "Waist_L", 41: "Rear", 42: "Waist_R", 43: "Bone_43", 44: "Bone_44", 45: "Foot_R", 46: "Foot_L",
        47: "Leg_L.003", 48: "Leg_R.003", 49: "Neck_front", 50: "Bone_50",
        **{i: f"Bone_{i:02d}" for i in range(51, 256)}
    }
    
    if isinstance(vertex_groups, dict):
        for bone_id_str, vertex_indices in vertex_groups.items():
            if vertex_indices:
                bone_id = int(bone_id_str)
                bone_name = bone_names.get(bone_id, f"Bone_{bone_id:02d}")
                vertex_group = obj.vertex_groups.new(name=bone_name)
                vertex_group.add(vertex_indices, 1.0, 'REPLACE')
    else:
        for bone_id, vertex_indices in enumerate(vertex_groups):
            if vertex_indices:
                bone_name = bone_names.get(bone_id, f"Bone_{bone_id:02d}")
                vertex_group = obj.vertex_groups.new(name=bone_name)
                vertex_group.add(vertex_indices, 1.0, 'REPLACE')

def create_combined_model_with_colors(item_data, models, combined_model_data, collection):
    """Create a combined model and merge colors from sub-models"""
    item_name = item_data['name']
    model_type = item_data['modelType']
    color_overrides = item_data.get('colorOverrides', {})
    
    name = f"{item_name}_{model_type}_combined"
    
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    
    vertices = [convert_coordinates(v) for v in combined_model_data['vertices']]
    faces = combined_model_data['faces']
    
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    
    combined_vertex_groups = {}
    model_parts = combined_model_data.get('modelParts', [])
    
    for part in model_parts:
        model_id = str(part['modelId'])
        vertex_start = part['vertexStart']
        vertex_end = part['vertexEnd']
        
        if model_id in models:
            sub_model = models[model_id]
            sub_vertex_groups = sub_model.get('vertexGroups', [])
            
            for bone_id, vertex_indices in enumerate(sub_vertex_groups):
                if vertex_indices:
                    offset_indices = [idx + vertex_start for idx in vertex_indices if idx + vertex_start <= vertex_end]
                    
                    if bone_id not in combined_vertex_groups:
                        combined_vertex_groups[bone_id] = []
                    combined_vertex_groups[bone_id].extend(offset_indices)
    
    create_vertex_groups(obj, combined_vertex_groups)
    
    combined_face_colors = []
    
    for part in model_parts:
        model_id = str(part['modelId'])
        face_start = part['faceStart']
        face_end = part['faceEnd']
        
        if model_id in models:
            sub_model = models[model_id]
            sub_face_colors = sub_model.get('faceColors', [])
            has_colors = sub_model.get('hasColors', False)
            
            face_count = face_end - face_start + 1
            if sub_face_colors and has_colors and len(sub_face_colors) >= face_count:
                combined_face_colors.extend(sub_face_colors[:face_count])
            else:
                default_color = 32767
                combined_face_colors.extend([default_color] * face_count)
        else:
            face_count = part['faceEnd'] - part['faceStart'] + 1
            default_color = 32767
            combined_face_colors.extend([default_color] * face_count)
    
    if combined_face_colors:
        final_colors = apply_color_overrides(combined_face_colors, color_overrides)
        create_colormap_material(obj, final_colors)
    
    obj["item_id"] = item_data['id']
    obj["item_name"] = item_data['name']
    obj["model_id"] = "combined"
    obj["model_type"] = model_type
    obj["has_recolors"] = item_data.get('hasRecolors', False)
    obj["is_combined"] = True
    obj["part_count"] = item_data.get('partCount', 1)
    obj["has_colors"] = len(combined_face_colors) > 0
    
    return obj

def create_model_mesh(item_data, model_data, collection):
    """Create a mesh with vertex groups and proper Jagex color conversion"""
    model_id = model_data['modelId']
    item_name = item_data['name']
    model_type = item_data['modelType']
    color_overrides = item_data.get('colorOverrides', {})
    
    name = f"{item_name}_{model_type}_{model_id}"
    
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    
    vertices = [convert_coordinates(v) for v in model_data['vertices']]
    faces = model_data['faces']
    
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    
    vertex_groups = model_data.get('vertexGroups', [])
    create_vertex_groups(obj, vertex_groups)
    
    face_colors = model_data.get('faceColors', [])
    has_colors = model_data.get('hasColors', False)
    
    if face_colors and has_colors:
        final_colors = apply_color_overrides(face_colors, color_overrides)
        create_colormap_material(obj, final_colors)
    
    obj["item_id"] = item_data['id']
    obj["item_name"] = item_data['name']
    obj["model_id"] = model_id
    obj["model_type"] = model_type
    obj["has_recolors"] = item_data.get('hasRecolors', False)
    obj["has_colors"] = has_colors
    
    obj["is_combined"] = False
    
    return obj

def import_model_data(data):
    """
    Main function to import model data received from the web app.
    This function now handles both combined models and individual item/kit models correctly.
    """
    models = data.get('models', {})
    items = data.get('items', [])
    target_collection = get_active_collection()
    imported_objects = []

    print(f"Received {len(items)} item entries and {len(models)} model entries for import.")

    # Iterate through each item entry sent from the frontend
    for item_data in items:
        is_combined = item_data.get('isCombined', False)
        model_id = str(item_data.get('modelId'))

        # Skip if the model ID is missing or not in the models dictionary
        if not model_id or model_id not in models:
            print(f"Skipping item '{item_data.get('name')}' because model ID '{model_id}' was not found.")
            continue

        model_to_process = models[model_id]

        try:
            if is_combined:
                # This is a multi-part item, create a combined mesh for it
                print(f"Importing '{item_data.get('name')}' as a combined model.")
                obj = create_combined_model_with_colors(item_data, models, model_to_process, target_collection)
                imported_objects.append(obj)
            else:
                # This is a single-part item or kit, create a simple mesh
                # We only want to process the 'leaf' nodes, not the combined ones that also get sent
                if not model_to_process.get('isCombined', False):
                    print(f"Importing '{item_data.get('name')}' as a single model (ID: {model_id}).")
                    obj = create_model_mesh(item_data, model_to_process, target_collection)
                    imported_objects.append(obj)

        except Exception as e:
            print(f"Failed to create mesh for item '{item_data.get('name')}' (Model ID: {model_id}). Error: {e}")

    return imported_objects