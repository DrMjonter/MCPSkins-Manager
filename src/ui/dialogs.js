'use strict';
const {validateNamePrefix} = require('../domain/skin');

function message(title, text) {
    Blockbench.showMessageBox({title, message: text, icon: 'info', buttons: ['OK']});
}

function confirmDiscard() {
    return new Promise(resolve => Blockbench.showMessageBox({
        title: 'Discard unsaved changes?', message: 'You have unsaved MCPSkins registry edits. Discard them?',
        buttons: ['Discard', 'Cancel'], confirm: 0, cancel: 1
    }, result => resolve(result === 0)));
}

function packDialog(initial, readPack, apply) {
    const dialog = new Dialog('mcpskins_pack', {
        title: 'MCPSkins Pack', width: 600,
        form: {
            pack_directory: {label: 'Pack Directory', type: 'folder', value: initial.directory},
            pack_namespace: {label: 'Pack Namespace', type: 'text', value: initial.namespace}
        },
        onFormChange(values) {
            if (!values.pack_directory || values.pack_directory === currentDirectory) return;
            currentDirectory = values.pack_directory;
            try {
                connection = readPack(currentDirectory);
                dialog.setFormValues({pack_namespace: connection.settings.pack_namespace});
                if (connection.warning) message('Pack settings', connection.warning + '\nUsing the example namespace default.');
            } catch (error) { connection = null; message('Could not connect', error.message); }
        },
        onConfirm(values) {
            // Returning false keeps the dialog open while the controller resolves dirty edits.
            Promise.resolve(apply(values, connection)).then(ok => { if (ok) dialog.hide(); }).catch(error => message('Pack not applied', error.message));
            return false;
        }
    });
    let currentDirectory = initial.directory;
    let connection = null;
    dialog.show();
    return dialog;
}

function colorDialog(color, apply) {
    const dialog = new Dialog('mcpskins_color', {
        title: 'Skin label color',
        form: {color: {label: 'Color', type: 'color', value: /^#[a-f0-9]{6}$/i.test(color) ? color : '#FFFFFF'}},
        onConfirm(values) {
            const raw = typeof values.color === 'string' ? values.color : values.color.toHexString();
            apply((raw.startsWith('#') ? raw : '#' + raw).toUpperCase());
            dialog.hide();
        }
    });
    dialog.show();
    return dialog;
}

function namePrefixDialog(weapon, accept, cancel) {
    const dialog = new Dialog('mcpskins_weapon_prefix', {
        title: 'Custom weapon name prefix', width: 500,
        form: {
            weapon: {label: 'Weapon ID', type: 'text', value: weapon, readonly: true},
            prefix: {label: 'Weapon name prefix', type: 'text', value: '', placeholder: 'Karambit',
                description: 'Used as “Weapon name | Skin name” and remembered for this weapon ID.'}
        },
        onConfirm(values) {
            try { accept(validateNamePrefix(values.prefix)); dialog.hide(); }
            catch (error) { message('Invalid weapon name', error.message); return false; }
        },
        onCancel() { cancel(); }
    });
    dialog.show();
    return dialog;
}

module.exports = {message, confirmDiscard, packDialog, colorDialog, namePrefixDialog};
