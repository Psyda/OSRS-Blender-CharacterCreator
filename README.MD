# Oldschool RuneScape Character Creator for Blender

**[☕ Support on Patreon](https://www.patreon.com/c/u5323457)** | **[🌐 Try the Web App](https://Psyda.github.io/OSRS-Blender-CharacterCreator/)**

A web-based character creator for Old School RuneScape that integrates directly with Blender. Browse items, character kits, and equipment with a clean interface, then export complete character builds to Blender with one click.

## Quick Start

1. **Install OSRS-Bridge Addon**: Download `OSRS-Bridge.zip` from [releases](https://github.com/Psyda/OSRS-Blender-CharacterCreator/releases) and install in Blender
2. **Try the Web App**: Visit [https://Psyda.github.io/OSRS-Blender-CharacterCreator/](https://Psyda.github.io/OSRS-Blender-CharacterCreator/) to create characters
3. **Connect**: Enable the OSRS-Bridge addon in Blender, then use the web app to send complete character builds to your scene

## Addon Installation

1. Download the latest `OSRS-Bridge.zip` from the [Releases](https://github.com/Psyda/OSRS-Blender-CharacterCreator/releases) page
2. In Blender: Edit → Preferences → Add-ons → Install
3. Select the downloaded zip file
4. Enable "OSRS-Bridge" addon
5. The addon will automatically listen for connections from the web app

## Features

- **Item Browser**: Search and preview all wearable OSRS items by equipment slot
- **Character Kits**: Browse hairstyles, body types, and character customization options
- **Equipment Preview**: Visual panel showing your selected item set
- **One-Click Export**: Send any combination of items/kits directly to Blender
- **Live Integration**: Real-time connection between web app and Blender

## Local Development

If you want to run the web app locally:

### Requirements
- A local web server (Python's `http.server`, `npx serve`, etc.)
- OSRS cache data files in the `cache/` directory

### Setup
```bash
git clone -b webapp https://github.com/Psyda/OSRS-Blender-CharacterCreator.git
cd OSRS-Blender-CharacterCreator
npx serve .
```

Then open `http://localhost:3000` in your browser

## API Endpoints

- `GET /api/kits` - Character kits (supports gender, page, limit params)
- `GET /api/category/:categoryName` - Items by equipment slot
- `GET /api/search` - Search items by name/ID
- `POST /api/send-item-to-blender/:itemId/:modelType` - Export item to Blender
- `POST /api/send-kit-to-blender/:kitId` - Export character kit to Blender

## Support Development

If this tool helps your OSRS/Blender projects:

**[☕ Support on Patreon](https://www.patreon.com/c/u5323457)**

## License

MIT License - feel free to fork and modify for your own projects.
