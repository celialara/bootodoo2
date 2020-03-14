// Copyright 2017 - 2018 Modoolar <info@modoolar.com>
// License LGPLv3.0 or later (https://www.gnu.org/licenses/lgpl-3.0.en.html).

odoo.define('scrummer.BaseWidgets', function (require) {
    "use strict";
    const Widget = require('web.Widget');
    const mixins = require('scrummer.mixins');
    const core = require('web.core');
    const _t = core._t;

    const AgileBaseWidget = Widget.extend(mixins.RequireMixin, {
        /* eslint-disable no-unused-vars,no-empty-function */
        __AGILE_BASE_WIDGET: true,
        init(parent, options = {}) {
            this._super(parent);
            this.__is_rendered = $.Deferred();
            this._is_rendered = this.__is_rendered.promise();
            this.__is_added_to_DOM = $.Deferred();
            this._is_added_to_DOM = this.__is_added_to_DOM.promise();
            this._destroyed = $.Deferred();
        },
        show() {
            this.$el.removeClass('oe_hidden');
        },
        hide() {
            this.$el.addClass('oe_hidden');
        },
        changeParent(parent) {
            if (this.getParent() === parent) {
                return;
            }
            if (this.$el) {
                this.$el.remove();
            }
            this.setParent(parent);
        },
        renderElement() {
            this._super();
            this.$el.attr(this.attributes);
        },

        attachTo: function (target) {
            const self = this;
            this.setElement(target.$el || target);
            return this.willStart().then(function () {
                self.resolveRenderAndDOM();
                return self.start();
            });
        },

        insertAt: function (target, index) {
            const self = this;
            return this.__widgetRenderAndInsert(function (t) {
                t.insertAt(self.$el, index);
            }, target);
        },

        willStart() {
            if (this.__willStartCalled) {
                throw new Error("You should not call willStart by yourself. Use _is_rendered promise to know when data is loaded.");
            }
            this.__willStartCalled = true;
            return this._super();
        },
        __widgetRenderAndInsert(insertion, target) {
            if (this.__willStartCalled) {
                this._is_rendered.then(() => {
                    insertion(target);
                });
                return $.when();
            }
            return this.willStart().then(() => {
                this.renderElement();
                insertion(target);
                this.resolveRenderAndDOM();
                return this.start();
            });
        },
        resolveRenderAndDOM() {
            this.__is_rendered.resolve();
            // If parent is agile widget attach to chain
            if (!this.__parentedDestroyed && this.getParent().__AGILE_BASE_WIDGET) {
                this.getParent()._is_added_to_DOM.then(() => {
                    this.__is_added_to_DOM.resolve();
                });
            }
        },
        addedToDOM() {
        },
        destroy() {
            this._super();
            this._destroyed.resolve(arguments);
        },
        start() {
            const ret = this._super();
            this._is_added_to_DOM.then(() => {
                this.addedToDOM();
            });
            return ret;
        },
        /**
         * This method destroys all children widgets, calls again willStart to prepare data and then renders widget again
         * @param {String[]} deferredsToClear array of field names that are used for resolving willStart. Those fields are getting set to undefined
         */
        rerender_widget(deferredsToClear = []) {
            this.emptyWidget();
            for (const field of deferredsToClear) {
                delete this[field];
            }
            this.__willStartCalled = false;
            this.willStart().then(() => {
                this.renderElement();
                return this.start();
            });
        },
        emptyWidget() {
            for (const children of this.getChildren()) {
                children.destroy();
            }
        }

    });
    const AgileViewWidget = AgileBaseWidget.extend(mixins.MenuItemsMixin, {
        menuItemsContainer: '.fixed-action-btn',
        custom_events: {
            set_title: '_onSetTitle',
            open_right_side: '_onOpenRightSide',
        },
        init(parent, options) {
            this._super(parent, options);
            this.options = options;
            mixins.MenuItemsMixin.init.call(this);
        },
        renderElement() {
            this._super();
            if (!this.title) {
                console.error("Title not set");
                this.title = _t("Project Agile");
            }
            const floatingButton = $(core.qweb.render("scrummer.view.floating-action-button", {widget: this}).trim());
            this.$el.append(floatingButton);
            this.setTitle(this.title);
        },
        setTitle(title, stringTitle) {
            if (title) {
                this.title = title;
                $("title").html(stringTitle || this.title);
                this.trigger_up("set_title", {title: this.title});
            }
        },
        _onSetTitle(evt) {
            if (this.subheader) {
                this.subheader.setTitle(evt.data.title);
            }
        },
        _onOpenRightSide(evt) {
            const WidgetClass = evt.data.WidgetClass;
            const widgetOptions = evt.data.options;

            this.$el.addClass("with-right");
            // If right side is open, then destroy current widget and send preventClosing signal.
            if (this.rightSideWidget) {
                this.rightSideWidget.destroy({preventClosing: true});
            }
            this.rightSideWidget = new WidgetClass(this, widgetOptions);
            this.rightSideWidget.appendTo(this.$("#right-detail-view").empty());

            this.rightSideWidget._destroyed.then((args) => {
                // Check if preventClosing signal is sent to widgets destroy method.
                if (typeof args[0] !== "object" || !args[0].preventClosing) {
                    this.$el.removeClass("with-right");
                    delete this.rightSideWidget;
                }
            });
        },
        start() {
            mixins.MenuItemsMixin.start.call(this);
            return this._super();
        },
        updateMenuVisibility() {
            mixins.MenuItemsMixin.updateMenuVisibility.call(this);
        },
    });
    const AgileContainerWidget = AgileBaseWidget.extend({
        init(parent, options) {
            this._super(parent, options);
            this.widgetDefinitions = [];
            this.widget = {};
        },
        renderElement() {
            this._super();
            this.build_widget_list();
            this.build_widgets();
        },
        build_widgets() {
            for (const def of this.widgetDefinitions) {
                this.render_widget(def);
            }
        },
        render_widget(def) {
            if (typeof def.condition === "undefined" ||
                (typeof def.condition === "function" && def.condition.call(this)) ||
                def.condition) {
                const args = typeof def.args === 'function' ? def.args(this) : def.args;
                const w = new def.widget(this, args || {});
                if (def.replace) {
                    w.replace(this.$(def.replace));
                } else if (def.append) {
                    w.appendTo(this.$(def.append));
                } else if (def.prepend) {
                    w.prependTo(this.$(def.prepend));
                } else {
                    w.appendTo(this.$el);
                }
                this.widget[def.id] = w;
            }
        },
        build_widget_list() {
        },
        /* This method should recieve widget in form like this:
         {
         'id':   'proxy_status',
         'widget': NameOfWidgetClass,
         'append':  '.css-selector', // or replace or prepend
         'condition': function(){ return true}, // Expression or function that returns boolean specifying if widget should be added or not
         'args': {} // object sent to widget as options
         }
         */
        add_widget(widgetDefinition) {
            this.widgetDefinitions.push(widgetDefinition);
        },
        rerender_widget(widgetDefinitions) {
            this.widgetDefinitions = [];
            this._super(widgetDefinitions);
        }

    });
    const DataWidget = AgileBaseWidget.extend({
        /**
         * @param {Widget} parent Parent widget
         * @param {Object} options DataWidget parameters.
         *
         * @param {String} options.id - The id of the record.
         * @param {String} options.data_service - Instance of DataService, if this is set, then DataWidget won't send requests to server directly.
         * @param {String} options.dataset - The dataset object of the record.
         * @param {string[]} [options.fields] - Fields that dataset should fetch of the record. Mandatory if data is not specified.
         * @param {String} [options.data] - The initial data used to set model.
         *                              If data is not specified, internal _model will be populated with data from server
         * @param {String} [options.name] Name of the model, used for easy identiication when debugging.
         * @param {String} [options.domID] This is used to set custom id of DOM node.
         */
        init(parent, options = {}) {
            Object.assign(this, options);
            this._super(parent, options);
            this._model = this.data;
            delete this.data;
            this._require_prop("id");
            this.useDataService = this.data_service && this.data_service.__dataService;
            if (this.useDataService) {
                // store reference to dataset from data_service for consistency
                this.dataset = this.data_service.dataset;
            } else {
                this._require_prop("dataset");
                this.wrapModel();
            }
        },
        willStart() {
            return this._super().then(() => {
                if (this.useDataService) {
                    return this.data_service.getRecord(this.id).then((record) => {
                        // Assigning proxy to this.__model is for backward compatibility. DataService will not trigger RPC if value doesn't change
                        this._model = record;
                        this.__model = record._source;
                        this.name = record.name;
                    });
                } else if (typeof this._model === "object") {
                    return $.when();
                }
                return this.dataset.read_ids([this.id], this.fields)
                    .then((result) => {
                        this._model = result[0];
                        // For easier debugging
                        // TODO: Make use of debug in querystring to toggle debugging code
                        this.name = this._model.name;
                    });

            });
        },
        /**
         * This method wraps this._model with proxy which forbids creating new property and automatically stores value on server
         * If you want to save value to model without triggering write call to server, use "this.__model"
         *
         * You can call methods on server model by calling function on _model. Context is sent to server by default, and
         * return value from that function is native JavaScript Promise object
         */
        wrapModel() {
            this._is_rendered.then(() => {
                const model = this._model;
                model.__widget = this;
                const keys = Object.keys(model);
                // this._model will trigger write
                this._model = new Proxy(model, {
                    set(trapTarget, key, value, receiver) {

                        if (!keys.includes(key) || key === "__widget" || key === "id") {
                            throw new TypeError("Trying to write non-existing property", arguments);
                        }
                        const widget = trapTarget.__widget;
                        // TODO: Find more elegant way to deal with many2one fields
                        const writeValue = Array.isArray(value) ? value[0] : value;
                        const displayValue = Array.isArray(value) ? value[1] : value;
                        widget.dataset.write(trapTarget.id, {[key]: writeValue})
                            .fail((r) => console.error(`Error ${trapTarget.__widget.dataset.model} [${trapTarget.id}]: ${key} - ${value}`, r));
                        widget.$(`[data-field="${key}"] .field_value`).text(displayValue);

                        return Reflect.set(trapTarget, key, value, receiver);
                    },
                    get(trapTarget, key, receiver) {
                        const widget = trapTarget.__widget;
                        const targetModel = trapTarget;
                        // if target doesn't contain key, assume it is function.
                        if (!(key in receiver)) {
                            // Wrap function in a Proxy that will catch arguments
                            return new Proxy(() => {
                            }, {
                                apply: function (target, thisArg, argumentList) {
                                    return widget.dataset._model.call(key, [[targetModel.id], ...argumentList], {context: widget.dataset.get_context().eval()});
                                }
                            });
                        }

                        return Reflect.get(trapTarget, key, receiver);
                    }
                });
                // this.__model will not trigger save rpc call
                this.__model = new Proxy(model, {
                    set(trapTarget, key, value, receiver) {
                        if (!keys.includes(key) || key === "__widget" || key === "id") {
                            throw new TypeError("Trying to write non-existing property");
                        }
                        const widget = trapTarget.__widget;
                        const displayValue = Array.isArray(value) ? value[1] : value;
                        widget.$(`[data-field="${key}"] .field_value`).text(displayValue);
                        return Reflect.set(trapTarget, key, value, receiver);
                    }
                });
            });
        },

        start() {
            this.$("[data-widget-editable=true]")
                .attr('contenteditable', 'true')
                .on('keypress', (e) => {
                    if (e.which === 13) {
                        e.preventDefault();
                        $(e.target).blur();
                    }
                })
                .blur((evt) => {
                    const target = $(evt.target);
                    const field = target.data("field");
                    if (!field) {
                        throw new Error("DataWidget data-field attribute must be set when using data-widget-editable!");
                    }
                    const oldVal = this._model[field];
                    const newValue = target.text().trim();
                    if (oldVal !== newValue) {
                        this.dataset.write(this.id, {[field]: newValue})
                            .fail((e) => {
                            console.error("Error while saving data: ", e);
                        });
                    }
                });
            return this._super();
        },
        /**
         * Overrides native Widget method by using domID instead of id for DOM node ID.
         * id is reserved for record id
         *
         * @returns {jQuery}
         * @override
         * @private
         */
        _make_descriptive() {
            const attrs = _.extend({}, this.attributes || {});
            if (this.domID) {
                attrs.domID = this.domID;
            }
            if (this.className) {
                attrs.class = this.className;
            }
            return $(this.make(this.tagName, attrs));
        },
        unlink() {
            return this.dataset.unlink([this.id])
                .fail((r) => console.error(`Error while deleting record: ${this.dataset.model}, ${this.id}`, r));
        }
    });

    return {
        AgileBaseWidget,
        AgileViewWidget,
        AgileContainerWidget,
        DataWidget
    };

});
