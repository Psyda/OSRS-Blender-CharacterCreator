# **OSRS Cache & Blender Integration Tool**

## **📜 Overview**

This project is a web-based tool designed to explore assets from the Old School RuneScape (OSRS) cache. It allows users to browse, search, and visualize in-game items and character kits (Identikits). The tool features a powerful integration with Blender, enabling users to send models directly from the cache explorer to a running Blender instance for easier access and use in 3D projects.

The project consists of two main parts:

1. A **Node.js backend server** that reads the OSRS cache files, processes the data, and serves it through a REST API.  
2. A **web-based frontend** that provides a user-friendly interface for searching and selecting assets.

## **✨ Features**

* **Item Explorer**: Browse all wearable items from the cache, organized by equipment slot.  
* **Character Kit Explorer**: Browse character customization kits (hairstyles, body types, etc.) filtered by gender.  
* **Advanced Search**: Search for items by name or ID.  
* **Equipment Panel**: A visual, in-app panel to see how a set of equipped items looks.  
* **Direct Blender Integration**: Send any item or character kit directly to Blender with a single click.  
* **Debug Tools**: Inspect the raw model data for kits to verify assets before sending them to Blender.

## **📋 Requirements**

Before you begin, ensure you have the following installed and set up:

* **Node.js**: Version 18.x or higher is recommended.  
* **OSRS Cache**: A complete and up-to-date OSRS cache directory. The server is configured to look for this in a ../cache directory relative to the project root.  
* **Blender**: A recent version of Blender.  
* **Companion Blender Addon**: The corresponding Blender addon that listens for data from this tool (assumed to be in a separate /blender-addon directory).

## **🚀 Setup & Installation**

Follow these steps to get the server up and running on your local machine.

1. **Clone the Repository**:  
   git clone https://github.com/your-username/your-project-name.git  
   cd your-project-name

2. Install Dependencies:  
   Navigate to the /server directory (or the project root, depending on your package.json location) and install the required Node.js packages.  
   npm install

3. Position the OSRS Cache:  
   Make sure your OSRS cache folder is located one directory above your project folder. For example:  
   /Development/  
   |-- /cache/         \<-- OSRS cache files here  
   |-- /osrs-blender-tool/  \<-- Your project folder here

4. Start the Server:  
   Run the following command from your project's root directory:  
   node cache\_explorer\_backend.js

   If successful, you will see a confirmation message in your terminal:  
   Cache Explorer Server running on http://localhost:3001  
5. Access the Web Interface:  
   Open your web browser and navigate to http://localhost:3001.

## **💡 Usage**

### **Web Interface**

* **Blender Connection**: Ensure your Blender instance is open with the companion addon running. Use the "Blender Integration" panel to check the connection status.  
* **Search Modes**:  
  * **Search Items**: Select an equipment slot on the character panel to browse items for that slot. Use the search bar to find specific items.  
  * **Search Kits**: Toggle to "Search Kits" mode to browse available character models. Use the gender filter to narrow down the results.  
* **Sending to Blender**:  
  * Click on any item or kit card to add it to your "equipped" set on the left panel.  
  * Click the **"Send Set to Blender"** button to export all selected items and kits to your connected Blender instance.

### **Blender Addon**

* Make sure the addon is installed and enabled in Blender.  
* The addon will automatically listen for incoming data on the configured port (default is 8889).  
* When you send a set from the web tool, the addon will create a new collection in Blender and import the models.

## **⚙️ API Endpoints**

The server exposes several API endpoints for fetching data.

* GET /api/kits: Get a paginated list of character kits.  
  * Query Params: gender, page, limit  
* GET /api/category/:categoryName: Get a paginated list of items in a specific category.  
  * Query Params: page, limit  
* GET /api/search: Search for items.  
  * Query Params: query, category, page, limit  
* POST /api/send-item-to-blender/:itemId/:modelType: Send a specific item model to Blender.  
* POST /api/send-kit-to-blender/:kitId: Send a specific kit to Blender.  
* GET /api/debug/kit/:kitId: Get the raw model data for a kit for debugging purposes.