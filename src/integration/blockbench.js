'use strict';
const {isFile} = require('../storage/files');

class BlockbenchBridge {
    constructor(path) { this.path = path; this.listeners = []; this.pending = null; }
    same(a, b) { return Boolean(a && b) && this.path.resolve(a) === this.path.resolve(b); }
    bindTexture(project, files) {
        const {model, texture, normal, specular} = files;
        const paths = [texture, normal, specular].filter(Boolean);
        const known = paths.map(filename => Texture.all.find(t => this.same(t.path, filename)));
        // Reuse in-memory painted textures without re-reading or replacing their pixels.
        const needsImport = known.some(t => !t);
        const needsOrder = known.some((t, index) => t && Texture.all[index] !== t);
        if (!needsImport && !needsOrder) { known[0].select(); return; }
        const textures = Texture.all.slice();
        Undo.initEdit({textures, elements: Cube.all.slice(), texture_order: true, selected_texture: true});
        const imported = paths.map((filename, index) => {
            if (known[index]) return known[index];
            const entry = new Texture({name: this.path.basename(filename)}).fromPath(filename).add(false);
            // Auxiliary maps are separate texture entries, not color overlays.
            if (index > 0) entry.render_mode = 'default';
            textures.push(entry);
            return entry;
        });
        const base = imported[0];
        if (!known[0]) {
            Cube.all.forEach(cube => cube.applyTexture(base, true));
            if (typeof base.setAsDefaultTexture === 'function') base.setAsDefaultTexture();
        }
        const rest = Texture.all.filter(entry => !imported.includes(entry));
        Texture.all.splice(0, Texture.all.length, ...imported, ...rest);
        base.select();
        Undo.finishEdit('Load MCPSkins skin textures');
        project.mcpskins_asset = {model, texture, normal: normal || null, specular: specular || null};
    }
    openModel(files, fs) {
        const {model, texture} = files;
        const hasTexture = isFile(fs, texture);
        const existing = ModelProject.all.find(p => this.same(p.export_path, model) || this.same(p.save_path, model));
        if (existing) {
            existing.select();
            // A multi-geometry file may still be waiting for its geometry selector.
            if (this.pending && this.same(this.pending.model, model)) return;
            this.cancelPending();
            if (hasTexture) this.bindTexture(existing, files);
            return;
        }
        this.cancelPending();
        const content = fs.readFileSync(model, 'utf8').replace(/^\uFEFF/, '');
        if (hasTexture) {
            const request = {model, tasks: new Set()};
            this.pending = request;
            const bind = () => {
                if (this.pending !== request) return;
                const project = Project;
                if (!project || !(this.same(project.export_path, model) || this.same(project.save_path, model))) return;
                this.cancelPending();
                try { this.bindTexture(project, files); }
                catch (error) { Blockbench.showMessageBox({title: 'Could not import skin texture', message: error.message || String(error), buttons: ['OK']}); }
            };
            // Wait for parsing, including a multi-geometry selection dialog. Deferring one
            // tick also allows Blockbench to finish restoring remembered model textures.
            for (const codec of new Set(Object.values(Codecs).filter(c => c && typeof c.on === 'function' && typeof c.removeListener === 'function'))) {
                const listener = () => {
                    const task = setTimeout(() => { request.tasks.delete(task); bind(); }, 0);
                    request.tasks.add(task);
                };
                codec.on('parsed', listener);
                this.listeners.push(() => codec.removeListener('parsed', listener));
            }
            this.pending.timer = setTimeout(() => this.cancelPending(), 300000);
        }
        try {
            loadModelFile({path: model, name: this.path.basename(model), content});
            if (!hasTexture) Blockbench.showQuickMessage('Model opened. No skin PNG exists beside this model.', 5000);
        } catch (error) { this.cancelPending(); throw error; }
    }
    cancelPending() {
        if (this.pending) {
            clearTimeout(this.pending.timer);
            this.pending.tasks.forEach(task => clearTimeout(task));
        }
        this.pending = null;
        this.listeners.splice(0).forEach(dispose => dispose());
    }
    dispose() { this.cancelPending(); }
}

module.exports = {BlockbenchBridge};
