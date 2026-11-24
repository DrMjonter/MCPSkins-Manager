'use strict';
const {exportFilename} = require('../assets/pack-export');
class ExportSelection {
    constructor(inventory,metadata={}) {
        this.inventory=inventory;this.metadata=metadata;
        this.state={version:typeof metadata.version==='string'?metadata.version:'1.0.0',filename:'',selected:inventory.rows.map(row=>row.key),search:'',busy:false,progress:'',error:'',notice:''};
        this.state.filename=this.suggestedName();
    }
    suggestedName() {return exportFilename(this.metadata.title,this.metadata.author,this.state.version);}
    version(value) {const previous=this.suggestedName();this.state.version=value;if(this.state.filename===previous)this.state.filename=this.suggestedName();}
    all(checked) {this.state.selected=checked?this.inventory.rows.map(row=>row.key):[];}
    toggle(rows,checked) {const selected=new Set(this.state.selected);for(const row of rows){if(checked)selected.add(row.key);else selected.delete(row.key);}this.state.selected=[...selected];}
    groups(kind) {
        const groups=new Map();
        for(const row of this.inventory.rows) {
            const key=kind==='collection'?row.collection.toLowerCase():row.statusId;
            if(!groups.has(key))groups.set(key,{key,label:kind==='collection'?row.collection || '(No collection)':row.statusLabel,color:kind==='collection'?'':row.statusColor,order:row.statusOrder || 0,rows:[]});
            groups.get(key).rows.push(row);
        }
        return [...groups.values()].sort((a,b)=>(kind==='status'?a.order-b.order:0) || a.label.localeCompare(b.label));
    }
}
module.exports={ExportSelection};
