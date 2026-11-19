'use strict';
const {validateNamePrefix} = require('../domain/skin');

function message(title, text) {
    Blockbench.showMessageBox({title, message: text, icon: 'info', buttons: ['OK']});
}

function confirmUnsaved(options = {}) {
    return new Promise(resolve => Blockbench.showMessageBox({
        title: options.title || 'Unsaved MCPSkins edits', message: options.message || 'Save your registry edits before continuing?',
        buttons: ['Save and Continue', 'Discard', 'Cancel'], confirm: 0, cancel: 2
    }, result => resolve(result === 0 ? 'save' : result === 1 ? 'discard' : 'cancel')));
}

function packDialog(initial, readPack, apply, recents = [], saveAuthor = () => {}) {
    let applying = false;
    const submit = (values, connection) => {
        if (applying) return;
        applying = true;
        return Promise.resolve(apply(values, connection)).then(ok => { if (ok) dialog.hide(); })
            .catch(error => message('Pack not applied', error.message)).finally(() => { applying = false; });
    };
    const dialog = new Dialog('mcpskins_pack', {
        title: 'MCPSkins Pack', width: 780,
        part_order: ['form', 'component', 'lines'],
        component: recentPacksComponent(recents, entry => {
            currentDirectory = entry.directory;
            currentAuthor = entry.author || '';
            connection = null;
            dialog.setFormValues({pack_directory: entry.directory, pack_namespace: entry.namespace, pack_author: currentAuthor});
            return submit({pack_directory: entry.directory, pack_namespace: entry.namespace}, null);
        }),
        form: {
            pack_directory: {label: 'Pack Directory', type: 'folder', value: initial.directory},
            pack_namespace: {label: 'Pack Namespace', type: 'text', value: initial.namespace},
            pack_author: {label: 'Author', type: 'text', value: initial.author || '', description: 'Saved automatically inside the selected pack.'}
        },
        onFormChange(values) {
            if (!values.pack_directory) return;
            if (values.pack_directory !== currentDirectory) {
                currentDirectory = values.pack_directory;
                try {
                    connection = readPack(currentDirectory);
                    currentAuthor = connection.author || '';
                    dialog.setFormValues({pack_namespace: connection.settings.pack_namespace, pack_author: currentAuthor});
                    if (connection.warning) message('Pack settings', connection.warning + '\nUsing the example namespace default.');
                } catch (error) { connection = null; message('Could not connect', error.message); }
                return;
            }
            if (typeof values.pack_author !== 'string' || values.pack_author === currentAuthor) return;
            currentAuthor = values.pack_author;
            try {
                const author = saveAuthor(currentDirectory, currentAuthor, connection);
                for (const entry of recents) if (entry.directory === currentDirectory) entry.author = author;
            } catch (error) { message('Author not saved', error.message); }
        },
        onConfirm(values) {
            // Returning false keeps the dialog open while the controller resolves dirty edits.
            submit(values, connection);
            return false;
        }
    });
    let currentDirectory = initial.directory;
    let currentAuthor = initial.author || '';
    let connection = null;
    dialog.show();
    return dialog;
}

function recentPacksComponent(entries, select) {
    return {
        data() { return {entries}; },
        methods: {select(entry) { return select(entry); }},
        template: `<section class="mcpskins-recent-packs">
            <h3>Recent Packs</h3>
            <div v-if="entries.length" class="mcpskins-recent-scroll"><table>
                <thead><tr><th>Name</th><th>Author</th><th>Path</th></tr></thead>
                <tbody><tr v-for="entry in entries" :key="entry.directory" tabindex="0" @click="select(entry)" @keydown.enter.prevent="select(entry)" @keydown.space.prevent="select(entry)" :title="'Open ' + entry.directory">
                    <td>{{entry.title}}</td><td>{{entry.author || 'Not specified'}}</td><td class="mcpskins-recent-path">{{entry.directory}}</td>
                </tr></tbody>
            </table></div>
            <p v-else class="mcpskins-muted">Selected packs will appear here.</p>
        </section>`
    };
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

module.exports = {recentPacksComponent, message, confirmUnsaved, packDialog, colorDialog, namePrefixDialog};
