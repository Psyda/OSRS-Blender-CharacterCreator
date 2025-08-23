# update_checker.py - Enhanced version with osrs_bridge naming

import bpy
import json
import urllib.request
import urllib.error
import threading
import time
import re
from bpy.types import PropertyGroup, Operator
from bpy.props import StringProperty, BoolProperty, IntProperty

class UpdateChecker:
    """Enhanced update checker with better GitHub integration"""
    
    UPDATE_URL = "https://api.github.com/repos/Psyda/OSRS-Blender-CharacterCreator/releases"
    LATEST_URL = "https://api.github.com/repos/Psyda/OSRS-Blender-CharacterCreator/releases/latest"
    
    @staticmethod
    def get_current_version():
        """Get current plugin version from bl_info"""
        try:
            from . import bl_info
            return bl_info["version"]
        except:
            return (1, 0, 0)  # Fallback version
    
    @staticmethod
    def version_to_string(version_tuple):
        """Convert version tuple to string"""
        return ".".join(map(str, version_tuple))
    
    @staticmethod
    def parse_version_string(version_string):
        """Parse various version string formats"""
        if not version_string:
            return (0, 0, 0)
        
        # Remove 'v' prefix and any extra text
        clean_version = re.sub(r'^v?([0-9.]+).*', r'\1', version_string.strip())
        
        try:
            parts = clean_version.split('.')
            # Ensure we have at least 3 parts (major, minor, patch)
            while len(parts) < 3:
                parts.append('0')
            
            return tuple(int(part) for part in parts[:3])
        except (ValueError, AttributeError):
            print(f"Failed to parse version string: {version_string}")
            return (0, 0, 0)
    
    @staticmethod
    def is_newer_version(current, latest):
        """Check if latest version is newer than current"""
        return latest > current
    
    @staticmethod
    def format_changelog(raw_body):
        """Format raw release notes into a clean changelog"""
        if not raw_body:
            return "No changelog available."
        
        # Clean up common markdown and formatting
        lines = raw_body.split('\n')
        formatted_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            # Convert markdown headers to simple text
            line = re.sub(r'^#+\s*', '', line)
            
            # Convert markdown lists
            line = re.sub(r'^\*\s*', '• ', line)
            line = re.sub(r'^-\s*', '• ', line)
            
            # Convert **bold** to simple text
            line = re.sub(r'\*\*(.*?)\*\*', r'\1', line)
            
            # Limit line length for UI display
            if len(line) > 70:
                line = line[:67] + "..."
            
            formatted_lines.append(line)
        
        return '\n'.join(formatted_lines[:20])  # Limit to 20 lines
    
    @staticmethod
    def check_for_updates_async():
        """Enhanced update checking with better error handling"""
        def check_updates():
            try:
                props = bpy.context.scene.osrs_bridge
                current_time = int(time.time())
                
                # Don't check more than once per hour unless forced
                if current_time - props.last_update_check < 3600:
                    return
                
                print("Checking for OSRS-Bridge updates...")
                
                # Try latest release first
                req = urllib.request.Request(UpdateChecker.LATEST_URL)
                req.add_header('User-Agent', 'OSRS-Bridge-Blender-Plugin/1.0')
                req.add_header('Accept', 'application/vnd.github.v3+json')
                
                try:
                    with urllib.request.urlopen(req, timeout=15) as response:
                        if response.getcode() == 200:
                            data = json.loads(response.read().decode())
                            UpdateChecker._process_release_data(data, current_time)
                        else:
                            print(f"GitHub API returned status code: {response.getcode()}")
                except urllib.error.HTTPError as e:
                    if e.code == 404:
                        print("No releases found in repository")
                    else:
                        print(f"HTTP Error checking for updates: {e.code}")
                except Exception as e:
                    print(f"Error checking latest release: {e}")
                    # Fallback to all releases endpoint
                    UpdateChecker._check_all_releases(current_time)
                    
            except Exception as e:
                print(f"Update check failed: {e}")
                def mark_failed_check():
                    try:
                        bpy.context.scene.osrs_bridge.last_update_check = current_time
                    except:
                        pass
                    return None
                bpy.app.timers.register(mark_failed_check, first_interval=0.1)
        
        thread = threading.Thread(target=check_updates, daemon=True)
        thread.start()
    
    @staticmethod
    def _check_all_releases(current_time):
        """Fallback method to check all releases"""
        try:
            req = urllib.request.Request(UpdateChecker.UPDATE_URL)
            req.add_header('User-Agent', 'OSRS-Bridge-Blender-Plugin/1.0')
            
            with urllib.request.urlopen(req, timeout=15) as response:
                releases = json.loads(response.read().decode())
                
                if releases and len(releases) > 0:
                    # Get the latest non-prerelease version
                    latest_release = None
                    for release in releases:
                        if not release.get('prerelease', False) and not release.get('draft', False):
                            latest_release = release
                            break
                    
                    if latest_release:
                        UpdateChecker._process_release_data(latest_release, current_time)
                    else:
                        print("No stable releases found")
                else:
                    print("No releases found in repository")
                    
        except Exception as e:
            print(f"Fallback update check failed: {e}")
    
    @staticmethod
    def _process_release_data(release_data, current_time):
        """Process release data and update UI"""
        def update_ui():
            try:
                props = bpy.context.scene.osrs_bridge
                props.last_update_check = current_time
                
                latest_version_str = release_data.get('tag_name', '').strip()
                release_name = release_data.get('name', '')
                release_body = release_data.get('body', '')
                
                if not latest_version_str:
                    print("No version tag found in release")
                    return None
                
                latest_version = UpdateChecker.parse_version_string(latest_version_str)
                current_version = UpdateChecker.get_current_version()
                
                current_str = UpdateChecker.version_to_string(current_version)
                latest_str = UpdateChecker.version_to_string(latest_version)
                
                print(f"Current version: {current_str}, Latest version: {latest_str}")
                
                if UpdateChecker.is_newer_version(current_version, latest_version):
                    props.update_available = True
                    props.update_version = latest_version_str.lstrip('v')
                    props.update_changelog = UpdateChecker.format_changelog(release_body)
                    props.update_dismissed = False
                    
                    # Store additional release info if properties exist
                    if hasattr(props, 'update_release_name'):
                        props.update_release_name = release_name
                    if hasattr(props, 'update_download_url'):
                        props.update_download_url = release_data.get('html_url', '')
                    
                    print(f"🎉 Update available: {latest_version_str}")
                    print(f"Release: {release_name}")
                    
                else:
                    props.update_available = False
                    print("✅ Plugin is up to date")
                
            except Exception as e:
                print(f"Error updating UI: {e}")
            
            return None
        
        bpy.app.timers.register(update_ui, first_interval=0.1)

class OSRS_OT_check_updates(Operator):
    """Check for plugin updates"""
    bl_idname = "osrs.check_updates"
    bl_label = "Check for Updates"
    bl_description = "Check if a newer version of the plugin is available"
    
    force_check: BoolProperty(
        name="Force Check",
        description="Force check even if recently checked",
        default=False
    )
    
    def execute(self, context):
        if not hasattr(context.scene, 'osrs_bridge'):
            self.report({'ERROR'}, "OSRS Bridge properties not found")
            return {'CANCELLED'}
        
        props = context.scene.osrs_bridge
        if not props.check_updates_enabled and not self.force_check:
            self.report({'INFO'}, "Update checking is disabled")
            return {'CANCELLED'}
        
        # Force check by resetting the last check time
        if self.force_check:
            props.last_update_check = 0
        
        UpdateChecker.check_for_updates_async()
        self.report({'INFO'}, "Checking for updates...")
        return {'FINISHED'}

class OSRS_OT_dismiss_update(Operator):
    """Dismiss the update notification"""
    bl_idname = "osrs.dismiss_update"
    bl_label = "Dismiss Update"
    bl_description = "Dismiss this update notification"
    
    def execute(self, context):
        props = context.scene.osrs_bridge
        props.update_dismissed = True
        self.report({'INFO'}, f"Update notification for v{props.update_version} dismissed")
        return {'FINISHED'}

class OSRS_OT_view_changelog(Operator):
    """Show the update changelog in a dialog"""
    bl_idname = "osrs.view_changelog"
    bl_label = "View Changelog"
    bl_description = "View the changelog for the latest version"
    
    def execute(self, context):
        return context.window_manager.invoke_props_dialog(self, width=600)
    
    def draw(self, context):
        layout = self.layout
        props = context.scene.osrs_bridge
        
        # Header
        header_box = layout.box()
        col = header_box.column(align=True)
        col.label(text=f"What's New in v{props.update_version}", icon='NEWFOLDER')
        col.separator()
        
        # Changelog content
        changelog_box = layout.box()
        col = changelog_box.column(align=True)
        
        changelog_lines = props.update_changelog.split('\n')
        for line in changelog_lines:
            if line.strip():
                # Handle different line types
                if line.startswith('•'):
                    col.label(text=line, icon='DOT')
                elif line.isupper() and len(line) < 30:  # Likely a section header
                    col.separator()
                    col.label(text=line, icon='PREFERENCES')
                else:
                    col.label(text=line)
        
        # Action buttons
        layout.separator()
        row = layout.row(align=True)
        row.operator("wm.url_open", text="Download Update", icon='IMPORT').url = "https://github.com/Psyda/OSRS-Blender-CharacterCreator/releases/latest"
        row.operator("wm.url_open", text="View on GitHub", icon='URL').url = f"https://github.com/Psyda/OSRS-Blender-CharacterCreator/releases/tag/v{props.update_version}"

def auto_check_updates():
    """Auto-check for updates on startup"""
    try:
        if hasattr(bpy.context.scene, 'osrs_bridge'):
            props = bpy.context.scene.osrs_bridge
            if props.check_updates_enabled:
                print("🔄 Starting automatic update check...")
                UpdateChecker.check_for_updates_async()
    except Exception as e:
        print(f"Auto update check failed: {e}")
    return None

def register_update_checker():
    """Register update checking components"""
    bpy.utils.register_class(OSRS_OT_check_updates)
    bpy.utils.register_class(OSRS_OT_dismiss_update) 
    bpy.utils.register_class(OSRS_OT_view_changelog)
    
    # Check for updates 3 seconds after startup
    bpy.app.timers.register(auto_check_updates, first_interval=3.0)

def unregister_update_checker():
    """Unregister update checking components"""
    try:
        bpy.utils.unregister_class(OSRS_OT_view_changelog)
        bpy.utils.unregister_class(OSRS_OT_dismiss_update)
        bpy.utils.unregister_class(OSRS_OT_check_updates)
    except:
        pass  # Classes might not be registered