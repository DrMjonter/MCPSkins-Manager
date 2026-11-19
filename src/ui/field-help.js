'use strict';

const HELP_TEXT = {
    "Weapon type": "The type of item this skin is for.",
    "Weapon ID": "The weapon\u2019s namespace ID, such as tacz:glock_17. Custom pack IDs are also supported.",
    "Skin ID": "A unique ID for this skin. Use lowercase letters, numbers, and underscores. Leave blank on a new skin to generate one.",
    "Skin name": "The skin\u2019s display name. The weapon prefix is added automatically.",
    "Override name prefix": "Use a custom weapon name before the skin name.",
    "Name prefix": "The text before the separator, such as \u201cGlock-17\u201d in \u201cGlock-17 | Candy Apple\u201d.",
    "Collection": "The collection this skin belongs to.",
    "Subtitle": "An optional short flavor line shown beneath the skin\u2019s name.",
    "Skin author": "The creator of this skin. Leave blank to use the registry file\u2019s author, if one is set.",
    "Rarity": "The skin\u2019s rarity tier, from Common to Legendary. Automatically scans this pack for custom rarities.",
    "Label color": "Color used for the skin\u2019s name. Defaults to its assigned rarity color.",
    "Reset color": "Restore the default color for the selected rarity.",
    "Description": "A description of the skin shown in game.",
    "Mark as new": "Show a NEW badge on this skin.",
    "Limited Edition": "Show a LIMITED badge on this skin.",
    "Locked text": "Optional text shown while this skin is locked.",
    "Unlocked by Default": "Make this skin available without requiring an unlock.",
    "Override Fusion Weight": "Set a custom fusion weight instead of using the default.",
    "Fusion weight": "The relative chance of getting this skin through fusion. Higher values make it more likely.",
    "Variants": "Other skins in this file that belong to this skin, such as alternate colorways.",
    "Level requirements": "Unlock variants by reaching goals while using this skin.",
    "Unlock variant": "The variant awarded when this level\u2019s requirements are met.",
    "Kills": "The number of general kills required for this level.",
    "Headshots": "The number of headshot kills required for this level.",
    "Player kills": "The number of player kills required for this level."
};

const fieldHelp = {
    props: {name: {type: String, required: true}},
    computed: {text() { return HELP_TEXT[this.name] || ''; }},
    template: `<span class="mcpskins-field-help" :title="text" :aria-label="name + ': ' + text" tabindex="0" @click.prevent.stop>?</span>`
};

module.exports = {fieldHelp};
