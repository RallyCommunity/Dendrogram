Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    itemId: 'rallyApp',
    statics: {
        MIN_COLUMN_WIDTH:   300,        //Looks silly on less than this
        MIN_ROW_HEIGHT: 20 ,                 //A cards minimum height is 80, so add a bit
        LOAD_STORE_MAX_RECORDS: 700 //Unless I fix the use of 'OR'ed filters, this is the max 
    },
    items: [
        {
            xtype: 'container',
            itemId: 'rootSurface',
            margin: '5 5 5 5',
            layout: 'auto',
            title: 'Loading...',
            autoEl: {
                tag: 'svg'
            },
            listeners: {
                afterrender:  function() {  gApp = this.up('#rallyApp'); gApp._onElementValid(this);},
//                resize: function() {  gApp = this.up('#rallyApp'); gApp._onElementResize(this);}
            },
            visible: false
        }
    ],
    //Set the SVG area to the surface we have provided
    _setSVGSize: function(surface) {
        var svg = d3.select('svg');
        svg.attr('width', surface.getEl().dom.clientWidth);
        svg.attr('height',surface.getEl().dom.clientHeight);
    },
    _nodeTree: null,
    //Continuation point after selectors ready/changed
    _enterMainApp: function() {

    console.log('Enter main app');
        //Get all the nodes and the "Unknown" parent virtual nodes
        gApp._nodes = gApp._nodes.concat(gApp._createMyNodes());
        var nodetree = gApp._createTree(gApp._nodes);

        //It is hard to calculate the exact size of the tree so we will guess here
        //When we try to use a 'card' we will need the size of the card

        var numColumns = (gApp._highestOrdinal()+1); //Leave extras for offset at left and text at right
        var columnWidth = this.getSize().width/numColumns;
        columnWidth = columnWidth > this.self.MIN_COLUMN_WIDTH ? columnWidth : this.self.MIN_COLUMN_WIDTH;
        treeboxHeight = (nodetree.leaves().length +1) * this.self.MIN_ROW_HEIGHT;

        var viewBoxSize = [columnWidth*numColumns, treeboxHeight];

        //Make surface the size available in the viewport (minus the selectors and margins)
        var rs = this.down('#rootSurface');
        rs.getEl().setWidth(viewBoxSize[0]);
        rs.getEl().setHeight(viewBoxSize[1]);
        //Set the svg area to the surface
        this._setSVGSize(rs);
        // Set the dimensions in svg to match
        var svg = d3.select('svg');
        svg.attr('class', 'rootSurface');
        svg.attr('preserveAspectRatio', 'none');
        svg.attr('viewBox', '0 0 ' + viewBoxSize[0] + ' ' + viewBoxSize[1]);

        gApp._nodeTree = nodetree;      //Save for later
        g = svg.append("g")        .attr("transform","translate(10,10)");
//        g = svg.append("g")        .attr("transform","translate(" + columnWidth + ",0)");
        //For the size, the tree is rotated 90degrees. Height is for top node to deepest child
        var tree = d3.tree()
            .size([viewBoxSize[1]-30, viewBoxSize[0] - columnWidth])     //Take off a chunk for the text??
            .separation( function(a,b) {
                    return ( a.parent == b.parent ? 1 : 1); //All leaves equi-distant
                }
            );
        tree(nodetree);
        gApp.tree = tree;
        gApp._refreshTree();
    },
    _refreshTree: function(){
        var g = d3.select('g');
        var nodetree = gApp._nodeTree;

         g.selectAll(".link")
            .data(nodetree.descendants().slice(1))
            .enter().append("path")
            .attr("class", function(d) { return d.data.invisibleLink? "invisible--link" :  "local--link" ;})
            .attr("d", function(d) {
                    return "M" + d.y + "," + d.x
                        + "C" + (d.parent.y + 100) + "," + d.x
                        + " " + (d.parent.y + 100) + "," + d.parent.x
                        + " " + d.parent.y + "," + d.parent.x;
            })
            ;
        var node = g.selectAll(".node")
            .data(nodetree.descendants())
            .enter().append("g")
            .attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; });
//        node.append(
//            "rect")
//                .attr("x", function(d) { return -25;})
//                .attr("y", function(d) { return -15;})
//                .attr("width", 50)
//                .attr("height", 30)
//                .attr("rx", 5)
//                .attr("ry", 5)
//                .attr("fill", "red")
//                .attr("opacity", 0.5);
        node.append("circle")
            .attr("r", 5)
            .attr("class", function (d) {
                return d.data.error ? "error--node" : "no--errors";
            })
            .on("click", function(node, index, array) { gApp._nodePopOver(node,index,array)});

        node.append("text")
              .attr("dy", 3)
              .attr("visible", false)
              .attr("x", function(d) { return d.children ? -8 : 8; })
              .attr("y", function(d) { return d.children ? -8 : 0; })
              .style("text-anchor", "start")
              .text(function(d) {  return d.children?d.data.Name : d.data.Name + ' ' + (d.data.record && d.data.record.data.Name); });
    },
    _nodePopOver: function(node,index,array) {

        if (!(node.data.record.data.ObjectID)) return; //Only exists on real items
        //Get ordinal (or something ) to indicate we are the lowest level, then use "UserStories" instead of "Children"
        var field = node.data.record.data.Children? 'Children' : 'UserStories';
        var model = node.data.record.data.Children? node.data.record.data.Children._type : 'UserStory';

        Ext.create('Rally.ui.dialog.Dialog', {
            autoShow: true,
            draggable: true,
            closable: true,
            width: 600,
            title: 'Descendants of ' + node.data.record.get('FormattedID') + ': ' + node.data.record.get('Name'),
            items: [
                {
                xtype: 'rallypopoverchilditemslistview',
                target: array[index],
                record: node.data.record,
                childField: field,
                addNewConfig: null,
                gridConfig: {
                    enableEditing: false,
                    enableRanking: false,
                    enableBulkEdit: false,
                    showRowActionsClumn: false,
                    columnCfgs : [
                        'FormattedID',
                        'Name',
                        'Owner',
                        'PercentDoneByStoryCount',
                        'PercentDoneByStoryPlanEstimate'
                    ]
                },
                model: model
            }]
        });
    },

    //Entry point after creation of render box
    _onElementValid: function(rs) {
        //Add any useful selectors into this container ( which is inserted before the rootSurface )
        //Choose a point when all are 'ready' to jump off into the rest of the app
        var hdrBox = this.insert (0,{
            xtype: 'container',
            itemId: 'headerBox',
            layout: 'hbox',
            items: [
                {
                    xtype: 'container',
                    itemId: 'filterBox'
                },
                {
                    xtype:  'rallyportfolioitemtypecombobox',
                    itemId: 'piType',
                    fieldLabel: 'Choose Lowest Portfolio Type :',
                    labelWidth: 100,
                    margin: '5 0 5 20',
//                    valueField: 'Ordinal',
                    defaultSelectionPosition: 'first',
                    storeConfig: {
                        sorters: {
                            property: 'Ordinal',
                            direction: 'ASC'
                        }
                    },
                    listeners: {
                        select: function(a,b,c,d,e,f) { console.log(a,b,c,d,e,f); gApp._kickOff();}    //Jump off here to add portfolio size selector
                    }
                },
//                {
//                    xtype: 'rallybutton',
//                    itemId: 'ancestorsButton',
//                    margin: '5 0 5 20',
//                    text: 'Show Ancestors',
//                    handler: function() {
//                        gApp._handleAncestors();
//                    }
//                },
//                {
//                    xtype: 'rallybutton',
//                    itemId: 'descendantsButton',
//                    margin: '5 0 5 20',
//                    text: 'Show Descendants',
//                    handler: function() {
//                        gApp._handleDescendants();
//                    }
//                },
//                {
//                    xtype: 'rallyprojecttree',
//                    autoLoadTopLevel: false,
//                    topLevelStoreConfig: {
//                        context: {
//                            workspace: gApp.getContext().getWorkspaceRef(),
//                            project: gApp.getContext().getProjectRef()
//                        }
//                    }
//                }
            ]
        });
    },

    _hideAncestors: function() {

    },
    _showAncestors: function() {
        //For each leaf, check whether we have the parent, grand-parent, great-grand-parent, etc., etc.
        var nodetree = gApp._nodeTree;
        var leaves = nodetree.leaves();
        debugger;
    },
    _handleAncestors: function() {
        if ( this.hideAncestors) {
            this.hideAncestors = false;
            this.down('#ancestorsButton').setText('Show Ancestors');
            this._hideAncestors();
            console.log('Show A');
        }
        else {
            this.down('#ancestorsButton').setText('Hide Ancestors');
            this.hideAncestors = true;
            this._showAncestors();
            console.log('Hide A');
        }
    },
    _hideDescendants: function() {

    },
    _showDescendants: function() {

    },
    _handleDescendants: function() {
        if ( this.hideDescendants) {
            this.hideDescendants = false;
            this.down('#descendantsButton').setText('Show Descendants');
            this._hideDescendants();
            console.log('Show D');
        }
        else {
            this.down('#descendantsButton').setText('Hide Descendants');
            this.hideDescendants = true;
            this._showDescendants();
            console.log('Hide D');
        }
    },
    
    _onFilterReady: function(inlineFilterPanel) {
        gApp.insert(1,inlineFilterPanel);
    },

    _onFilterChange: function(inlineFilterButton) {
        console.log('filterchange');
        gApp._filterInfo = inlineFilterButton.getTypesAndFilters();
        gApp._fireFilterPanelEvent();
    },

    _nodes: [],
    _filterPanel: false,

    //We don't want the initial setup firing of the event
    _fireFilterPanelEvent: function() {
        if (!gApp._filterPanel) {
            gApp._filterPanel = true;
        }
        else {
            gApp._kickOff();
        }
    },

    _kickOff: function() {
        var ptype = gApp.down('#piType');
        gApp._typeStore = ptype.store;

        if (!gApp._filterPanel){
            gApp._addFilterPanel();
        }

        gApp._getArtifacts(ptype);
    },

    _addFilterPanel: function() {
            var hdrBox = gApp.down('#headerBox');
            //Add a filter panel
            var blackListFields = ['Successors', 'Predecessors', 'DisplayColor'],
                whiteListFields = ['Milestones', 'Tags'];
            var modelNames = [];
            for ( var i = 0; i <= gApp._highestOrdinal(); i++){
                modelNames.push(gApp._getModelFromOrd(i));
            }
            hdrBox.add({
                xtype: 'rallyinlinefiltercontrol',
                itemId: 'filterPanel',
                context: this.getContext(),
                margin: '5 0 0 60',
                height: 26,
                inlineFilterButtonConfig: {
                    stateful: true,
                    stateId: this.getContext().getScopedStateId('inline-filter'),
                    context: this.getContext(),
                    modelNames: modelNames,
                    filterChildren: false,
                    inlineFilterPanelConfig: {
                        quickFilterPanelConfig: {
                            defaultFields: ['ArtifactSearch', 'Owner'],
                            addQuickFilterConfig: {
                                blackListFields: blackListFields,
                                whiteListFields: whiteListFields
                            }
                        },
                        advancedFilterPanelConfig: {
                            advancedFilterRowsConfig: {
                                propertyFieldConfig: {
                                    blackListFields: blackListFields,
                                    whiteListFields: whiteListFields
                                }
                            }
                        }
                    },
                    listeners: {
                        inlinefilterchange: this._onFilterChange,
                        inlinefilterready: this._onFilterReady,
                        scope: this
                    }
                }
            });
    },

    _getArtifacts: function(ptype) {
    console.log('getArtifacts');
        //On re-entry remove all old stuff
        if ( gApp._nodes) gApp._nodes = [];
        if (gApp._nodeTree) {
            d3.select("g").remove();
            gApp._nodeTree = null;
        }
        //Starting with lowest selected by the combobox, go up
        var typeRecord = ptype.getRecord();
        var modelNumber = typeRecord.get('Ordinal');
        var typeRecords = ptype.store.getRecords();
        gApp._loadStoreLocal( typeRecords[modelNumber].get('TypePath')).then({
            success: function(dataArray) {
                //Start the recursive trawl upwards through the levels
                gApp._loadParents(dataArray, modelNumber);
            },
            failure: function(error) {
                console.log("Failed to load a store");
            }
        });
    },

    _loadParents: function(dataArray, modelNumber) {
    console.log('loadParents: ', dataArray);
        var data = dataArray[0];
        var parentModelNumber = modelNumber + 1;
        if ((data.length == 0)  ){
            //No more parents available, so branch off
            gApp._enterMainApp();
        }
        else {
            gApp._nodes = gApp._nodes.concat(gApp._createNodes(data));
            if (parentModelNumber > gApp._highestOrdinal()) {
                //No more parents to find, so branch off. This can happen is the user does not have permission to get the parents
                gApp._enterMainApp();
            }
            else {
                //Now create list for parents and find those
                var parentsToFind = [];
                _.each(data, function(record) {
                    var pObj = record.get('Parent') && record.get('Parent').ObjectID;
                    if (pObj) {
                        parentsToFind.push({'property': 'ObjectID', 'value': pObj});
                    }
                });
                parentsToFind = _.uniq(parentsToFind, function(p) { return p.value});
                //Do those have any parents to look for
                if (parentsToFind.length) {
                    gApp._loadStoreGlobal(gApp._getModelFromOrd(parentModelNumber), Rally.data.wsapi.Filter.or(parentsToFind)).then({
                        success: function (dArray) {
                            gApp._loadParents(dArray, parentModelNumber);
                        },
                        failure: function(error) {
                            console.log('Oops!');
                        }
                    });
                }
                else {
                    //No more parents to find, so branch off
                    gApp._enterMainApp();
                }
            }
        }
    },

    _loadStoreLocal: function(modelName) {
        var loadPromise = [];
        var storeConfig =
            {
                pageSize: this.self.LOAD_STORE_MAX_RECORDS,    //We will make use of the batchproxy on big transfers
                model: modelName,
                fetch:  ['Name', 'FormattedID', 'Parent', 'DragAndDropRank', 'Children', 'ObjectID', 'Project']
            };
        if (gApp._filterInfo && gApp._filterInfo.filters.length)
            storeConfig.filters = gApp._filterInfo.filters;

        var store = Ext.create('Rally.data.wsapi.Store', storeConfig);

        loadPromise.push(store.load());
        return Deft.Promise.all(loadPromise);
    },
    //Load some artifacts from the global arena as a promise
    _loadStoreGlobal: function(modelName, filters) {
        var loadPromise = [];
        var config = {
            model: modelName,
            pageSize: this.self.LOAD_STORE_MAX_RECORDS,
            context: {
                workspace: gApp.getContext().getWorkspaceRef(),
                project: null
            },
            fetch:  ['Name', 'FormattedID', 'Parent', 'DragAndDropRank', 'Children', 'ObjectID', 'Project']
        };
        if (filters) {
            config.filters = filters
        }
        var store = Ext.create('Rally.data.wsapi.Store', config);
        loadPromise.push(store.load());
        return Deft.Promise.all(loadPromise);
    },
    _createNodes: function(data) {
        //These need to be sorted into a hierarchy based on what we have. We are going to add 'other' nodes later
        var nodes = [];
        //Push them into an array we can reconfigure
        _.each(data, function(record) {
            var card = Ext.create('Rally.ui.cardboard.Card', { record: record });
            var localNode = (gApp.getContext().getProjectRef() === record.get('Project')._ref);
            nodes.push({'Name': record.get('FormattedID'), 'record': record, 'local': localNode, 'card': card});
        });
        return nodes;
    },

    _createMyNodes: function() {
        var nodes = [];
        //Create a node for d3 to hook onto
        nodes.push({'Name': 'World View',
            'record': {
                'data': {
                    '_ref': 'root',
                    'Name': 'World View'
                }
            },
            'local':true
        });
        //Now push some entries to handle "parent-less" artefacts. This should create a 'tree' branch of parentless things
        _.each(gApp._getTypeList(), function(typedef) {
            nodes.push( { 'Name' : 'Unknown ' + typedef.Name,
                'record': {
                    'data': {
                            'FormattedID' : 'Parent Not Set',
                            'Name': 'Missing Parent (' + typedef.Name + ')',
                            '_ref': '/' + typedef.type + '/null',
                            '_type': typedef.type,
                            'Parent': null
                    }
                },
                'local': true,
                'error': true,       //Might want to highlight these in the UI
                'invisibleLink' : true
            });
        });
        return nodes;
    },
    _findNode: function(nodes, record) {
        var returnNode = null;
            _.each(nodes, function(node) {
                if ((node.record && node.record.data._ref) === record._ref){
                     returnNode = node;
                }
            });
        return returnNode;

    },
    _findParentType: function(record) {
        //The only source of truth for the hierachy of types is the typeStore using 'Ordinal'
        var ord = null;
        for ( var i = 0;  i < gApp._typeStore.totalCount; i++ )
        {
            if (record.data._type === gApp._typeStore.data.items[i].get('TypePath').toLowerCase()) {
                ord = gApp._typeStore.data.items[i].get('Ordinal');
                break;
            }
        }
        ord += 1;   //We want the next one up, if beyond the list, set type to root
        //If we fail this, then this code is wrong!
        if ( i >= gApp._typeStore.totalCount) {
            return null;
        }
        var typeRecord =  _.find(  gApp._typeStore.data.items, function(type) { return type.get('Ordinal') === ord;});
        return (typeRecord && typeRecord.get('TypePath').toLowerCase());
    },
    _findParentById: function(nodes, id) {
        return _.find(nodes, function(node) {
            return node.record.data._ref === id;
        });
    },
    _findParentNode: function(nodes, child){
        if (child.record.data._ref === 'root') return null;
        var parent = child.record.data.Parent;
        var pParent = null;
        if (parent ){
            //Check if parent already in the node list. If so, make this one a child of that one
            //Will return a parent, or null if not found
            pParent = gApp._findNode(nodes, parent);
        }
        else {
            //Here, there is no parent set, so attach to the 'null' parent.
            var pt = gApp._findParentType(child.record);
            //If we are at the top, we will allow d3 to make a root node by returning null
            //If we have a parent type, we will try to return the null parent for this type.
            if (pt) {
                var parentName = '/' + pt + '/null';
                pParent = gApp._findParentById(nodes, parentName);
            }
        }
        //If the record is a type at the top level, then we must return something to indicate 'root'
        return pParent?pParent: gApp._findParentById(nodes, 'root');
    },
        //Routines to manipulate the types

     _getTypeList: function() {
        var piModels = [];
        _.each(gApp._typeStore.data.items, function(type) {
            //Only push types above that selected
            piModels.push({ 'type': type.data.TypePath.toLowerCase(), 'Name': type.data.Name});
        });
        return piModels;
    },

    _highestOrdinal: function() {
        return _.max(gApp._typeStore.data.items, function(type) { return type.get('Ordinal'); }).get('Ordinal');
    },
    _getModelFromOrd: function(number){
        var model = null;
        _.each(gApp._typeStore.data.items, function(type) { if (number == type.get('Ordinal')) { model = type; } });
        return model && model.get('TypePath');
    },

    _createTree: function (nodes) {
        //Try to use d3.stratify to create nodet
        var nodetree = d3.stratify()
                    .id( function(d) {
                        var retval = (d.record && d.record.data._ref) || null; //No record is an error in the code, try to barf somewhere if that is the case
                        return retval;
                    })
                    .parentId( function(d) {
                        var pParent = gApp._findParentNode(nodes, d);
                        return (pParent && pParent.record && pParent.record.data._ref); })
                    (nodes);
        return nodetree;
    },
    launch: function() {
        //API Docs: https://help.rallydev.com/apps/2.1/doc/
    }
});