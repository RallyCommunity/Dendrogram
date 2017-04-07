Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    itemId: 'rallyApp',
        MIN_COLUMN_WIDTH:   300,        //Looks silly on less than this
        MIN_ROW_HEIGHT: 20 ,                 //A cards minimum height is 80, so add a bit
        LOAD_STORE_MAX_RECORDS: 100, //Can blow up the Rally.data.wsapi.filter.Or
        WARN_STORE_MAX_RECORDS: 300, //Can be slow if you fetch too many
        STORE_FETCH_FIELD_LIST:
            [
                'Name',
                'FormattedID',
                'Parent',
                'DragAndDropRank',
                'Children',
                'ObjectID',
                'Project',
                'DisplayColor',
                'Owner',
                'Blocked',
                'BlockedReason',
                'Ready',
                'Tags',
                'Workspace',
                'RevisionHistory',
                'CreationDate',
                'PercentDoneByStoryCount',
                'PercentDoneByStoryPlanEstimate',
                'State',
                'PreliminaryEstimate',
                'Description',
                'Notes'
            ],
        CARD_DISPLAY_FIELD_LIST:
            [
                'Name',
                'Owner',
                'PreliminaryEstimate',
                'Parent',
                'Project',
                'PercentDoneByStoryCount',
                'PercentDoneByStoryPlanEstimate',
                'State'
            ],

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
        columnWidth = columnWidth > gApp.MIN_COLUMN_WIDTH ? columnWidth : gApp.MIN_COLUMN_WIDTH;
        treeboxHeight = (nodetree.leaves().length +1) * gApp.MIN_ROW_HEIGHT;

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

        //We're going to set the colour of the dot depndent on some criteria (in this case only in-progress
        node.append("circle")
            .attr("r", 5)
            .attr("class", function (d) {
                if (d.data.record.data.ObjectID){
                    if (!d.data.record.get('State')) return "error--node";      //Not been set - which is an error in itself
                    switch (d.data.record.get('State').Name) {
                        case 'Backlog':
                            return "no--errors--not--started";
                        case 'Refinement':
                        case 'In Progress':
                            return "no--errors--in--progress";
                        case 'Done':
                            return "no--errors--done";
                    }
                } else {
                    return d.data.error ? "error--node": "no--errors--done";
                }
            })
            .on("click", function(node, index, array) { gApp._nodeClick(node,index,array)})
            .on("mouseover", function(node, index, array) { gApp._nodeMouseOver(node,index,array)})
            .on("mouseout", function(node, index, array) { gApp._nodeMouseOut(node,index,array)});

        node.append("text")
              .attr("dy", 3)
              .attr("visible", false)
              .attr("x", function(d) { return d.children ? -8 : 8; })
              .attr("y", function(d) { return d.children ? -8 : 0; })
              .style("text-anchor", "start")
              .text(function(d) {  return d.children?d.data.Name : d.data.Name + ' ' + (d.data.record && d.data.record.data.Name); });
    },

    _nodeMouseOut: function(node, index,array){
        if (node.card) node.card.hide();
    },

    _nodeMouseOver: function(node,index,array) {
        if (!(node.data.record.data.ObjectID)) {
            //Only exists on real items, so do something for the 'unknown' item
            return;
        } else {

            if ( !node.card) {
                var card = Ext.create('Rally.ui.cardboard.Card', {
                    'record': node.data.record,
                    fields: gApp.CARD_DISPLAY_FIELD_LIST,
                    constrain: false,
                    width: gApp.MIN_COLUMN_WIDTH,
                    height: 'auto',
                    floating: true,
                    shadow: false,
                    showAge: true,
                    resizable: true
                });
                node.card = card;
            }
            node.card.show();
//            debugger;
        }
    },

    _nodeClick: function (node,index,array) {
        if (!(node.data.record.data.ObjectID)) return; //Only exists on real items
        //Get ordinal (or something ) to indicate we are the lowest level, then use "UserStories" instead of "Children"
        var field = node.data.record.data.Children? 'Children' : 'UserStories';
        var model = node.data.record.data.Children? node.data.record.data.Children._type : 'UserStory';

        Ext.create('Rally.ui.dialog.Dialog', {
            autoShow: true,
            draggable: true,
            closable: true,
            width: 600,
            title: 'Information for ' + node.data.record.get('FormattedID') + ': ' + node.data.record.get('Name'),
            items: [
                {
//                    xtype: 'component',
//                    layout: {
//                        type: 'vbox',
//                        align: 'stretch'
//                    },
//                    record: node.data.record,
//                    model: node.data.record.self.model,
//                    details: '',
//                    detailsField: 'Description',
//                    detailsFieldBackup: 'Notes',
//                    initComponent: function() {
//                        this._setDetailsField();
//                        this._createTpl();
//                        this.callParent(arguments);
//                    },
//                    _setDetailsField: function() {
//                        this.details = this.record.get(this.detailsField) || this.record.get(this.detailsFieldBackup);
//                    },
//                    _createTpl: function() {
//                            //  Have to create the template this way to maintain scope when it is applied
//                            this.tpl = new Ext.XTemplate(
//                                '<tpl>',
//                                    '<div class="header">',
//                                        '<b>{[values[0].FormattedID]}:</b> {[values[0].Name]}',
//                                    '</div>',
//                                    '<div class="description">{[this.getDetails(values)]}</div>',
//                                '</tpl>'
//                            );
//
//                            this.tpl.self.addMembers({
//                                getDetails: Ext.bind(function(data) {
//                                    return this.detailsField;
//                                }, this)
//                            });
//                        }

                        xtype: 'rallycard',
                        record: node.data.record,
                        fields: gApp.CARD_DISPLAY_FIELD_LIST,
                        showAge: true,
                        resizable: true


                },
                {
                xtype: 'rallypopoverchilditemslistview',
                target: array[index],
                record: node.data.record,
                childField: field,
                addNewConfig: null,
                gridConfig: {
                    title: 'Children of ' + node.data.record.data.FormattedID,
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
                    defaultSelectionPosition: 'first',
                    storeConfig: {
                        sorters: {
                            property: 'Ordinal',
                            direction: 'ASC'
                        }
                    },
                    listeners: {
                        select: function() { gApp._kickOff();}    //Jump off here to add portfolio size selector
                    }
                },
            ]
        });
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
                if (dataArray.length >= gApp.WARN_STORE_MAX_RECORDS) {
                    Rally.ui.notify.Notifier.showWarning({message: 'Excessive limit of first level records. Narrow your scope '});
                }
                //Start the recursive trawl upwards through the levels
                gApp._loadParents(dataArray, modelNumber);
            },
            failure: function(error) {
                console.log("Failed to load a store");
            }
        });
    },

    _loadParents: function(data, modelNumber) {
    console.log('loadParents: ', data);
        var parentModelNumber = modelNumber + 1;
        if ((data.length == 0)  ){
            //No more parents available, so branch off
            gApp._enterMainApp();
        }
        else {
            gApp._nodes = gApp._nodes.concat(gApp._createNodes(data));
            if (parentModelNumber > gApp._highestOrdinal()) {
                //No more parents to find, so branch off. This can happen if the user does not have permission to get the parents
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
                    gApp._loadStoreGlobal(gApp._getModelFromOrd(parentModelNumber), parentsToFind).then({
                        success: function (dArray) {
                            // After multiple fetches, we need to reduce down to a single level of array nesting
                            gApp._loadParents(_.flatten(dArray), parentModelNumber);
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
        var storeConfig =
            {
                model: modelName,
                limit: 20000,
                fetch:  gApp.STORE_FETCH_FIELD_LIST
            };
        if (gApp._filterInfo && gApp._filterInfo.filters.length) {
            storeConfig.filters = gApp._filterInfo.filters;
            storeConfig.models = gApp._filterInfo.types;
        }
        var store = Ext.create('Rally.data.wsapi.Store', storeConfig);
        return store.load();
    },

    //Load some artifacts from the global arena as a promise
    _loadStoreGlobal: function(modelName, parents) {
        var loadPromises = [];
        var config = {
            model: modelName,
            pageSize: gApp.LOAD_STORE_MAX_RECORDS,
            context: {
                workspace: gApp.getContext().getWorkspaceRef(),
                project: null
            },
            fetch:  gApp.STORE_FETCH_FIELD_LIST
        };
        while (parents.length) {
            var wConf = Ext.clone(config);
            wConf.pageSize = parents.length >= gApp.LOAD_STORE_MAX_RECORDS ? gApp.LOAD_STORE_MAX_RECORDS : parents.length;
            //Get the filters from the array
            wConf.filters = Rally.data.wsapi.Filter.or(_.first(parents, wConf.pageSize));
            parents = _.rest(parents, wConf.pageSize);
            var store = Ext.create('Rally.data.wsapi.Store', wConf);
            loadPromises.push(store.load());
        }
        return Deft.Promise.all(loadPromises);
    },
    _createNodes: function(data) {
        //These need to be sorted into a hierarchy based on what we have. We are going to add 'other' nodes later
        var nodes = [];
        //Push them into an array we can reconfigure
        _.each(data, function(record) {
            var localNode = (gApp.getContext().getProjectRef() === record.get('Project')._ref);
            nodes.push({'Name': record.get('FormattedID'), 'record': record, 'local': localNode});
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