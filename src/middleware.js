function applyRules(shape, rules) {
    let response = rules ? rules : shape;
    if (rules) {
        for (var key in shape) {
            if (typeof (shape[key]) === 'object') {
                if (!response.hasOwnProperty(key)) {
                    response[key] = shape[key];
                }
                applyRules(shape[key], response[key]);
            } else if (!response[key] && typeof (response[key]) !== 'boolean') {
                response[key] = shape[key];
            }
        }
    }
    
    for (let type in response) {
        if (response.hasOwnProperty(type)) {
            for (let key in response[type].resolvers) {
                if (response[type].resolvers.hasOwnProperty(key) && !response[type].resolvers[key].allowed) {
                    delete response[type].resolvers[key];
                }
            }
        }
    }

    return response;
}

function resolveInputType(scalarType) {
    switch (scalarType || scalarType.slice(0, -1)) {
    case 'Int':
        return 'number';
    case 'Float':
        return 'number';
    case 'Boolean':
        return 'checkbox';
    case 'String':
        return 'text';
    default:
        return 'text';
    }
}

function resolveInputControl(scalarType) {
    switch (scalarType || scalarType.slice(0, -1)) {
    case 'Int':
        return 'input';
    case 'Float':
        return 'input';
    case 'Boolean':
        return 'input';
    case 'String':
        return 'input';
    default:
        return 'input';
    }
}

function getResolverName(typeName, method, rules) {
    let resolverName = '';

    if (rules &&
        rules[typeName] &&
        rules[typeName].resolvers &&
        rules[typeName].resolvers[method] &&
        rules[typeName].resolvers[method].resolver
    ) {
        resolverName = rules[typeName].resolvers[method].resolver;
    } else {
        resolverName = typeName + '_' + method;
    }

    return resolverName;
}

function findResolverArgs(typeName, method, array, rules) {
    let args = {},
        tmpObj = {};

    if (rules &&
        rules[typeName] &&
        rules[typeName].resolvers &&
        rules[typeName].resolvers[method] &&
        rules[typeName].resolvers[method].resolver
    ) {
        tmpObj = array.find(function (obj) {
            return obj.name.value === rules[typeName].resolvers[method].resolver;
        });
    } else {
        tmpObj = array.find(function (obj) {
            return obj.name.value === typeName + '_' + method;
        });
    }
    if (tmpObj && tmpObj.arguments) {
        tmpObj.arguments.forEach(argObj => {
            let type = argObj.type.kind === 'NonNullType' ? `${argObj.type.type.name.value}!` : argObj.type.name.value;
            args[argObj.name.value] = type;
        });
    }
    return args;
}

function checkMethodPermission(typeName, method, mutations, rules) {
    let hasMethod = mutations.fields.find(function (obj) {
        return obj.name.value === `${typeName}_${method}`;
    }) ? true : false;

    if (hasMethod &&
        rules &&
        rules[typeName] &&
        rules[typeName].resolvers &&
        rules[typeName].resolvers[method] &&
        (rules[typeName].resolvers[method].allowed ||
        typeof (rules[typeName].resolvers[method].allowed) === 'boolean')
    ) {
        hasMethod = rules[typeName].resolvers[method].allowed;
    }

    return hasMethod;
}

module.exports = function (config) {
    var {parse} = require('graphql');
    var schema = config.schema ? parse(config.schema) : false;
    var rules = config.rules ? config.rules : false;
    var exclude = config.exclude ? config.exclude : false;

    if (!schema) {
        console.log('you have to provide your PRINTED schema in config object "{schema: myPrintedSchema}"');
        return;
    }
    return function (req, res) {
        if (req.method.toLowerCase() === 'get') {
            var Mutations = schema.definitions.find(function (obj) {
                return obj.name.value === 'Mutation';
            });
            var Queries = schema.definitions.find(function (obj) {
                return obj.name.value === 'Query';
            });
            var shape = {};

            Queries.fields.forEach(function (method) {
                var methodTypeName =
                    method.type &&
                    method.type.type &&
                    method.type.type.name &&
                    method.type.type.name.value ?
                        method.type.type.name.value : false;

                if (methodTypeName &&
                    Mutations.fields.find(function (obj) {
                        return obj.name.value.split('_')[0] === methodTypeName;
                    }) &&
                    (!exclude || !exclude.find(function (type) {
                        return type === methodTypeName;
                    }))) {
                    var methodTypeObject = schema.definitions.find(function (obj) {
                        return obj.name.value === methodTypeName;
                    });

                    shape[methodTypeName] = {
                        label: methodTypeName,
                        listHeader: {
                            id: [],
                            title: []
                        },
                        resolvers: {
                            find: {
                                resolver: getResolverName(methodTypeName, 'find', rules),
                                args: {
                                    query: findResolverArgs(methodTypeName, 'find', Queries.fields, rules),
                                    mutation: findResolverArgs(methodTypeName, 'find', Mutations.fields, rules)
                                },
                                allowed: true
                            },
                            create: {
                                resolver: getResolverName(methodTypeName, 'create', rules),
                                args: {
                                    query: findResolverArgs(methodTypeName, 'create', Queries.fields, rules),
                                    mutation: findResolverArgs(methodTypeName, 'create', Mutations.fields, rules)
                                },
                                allowed: checkMethodPermission(methodTypeName, 'create', Mutations, rules)
                            },
                            update: {
                                resolver: getResolverName(methodTypeName, 'update', rules),
                                args: {
                                    query: findResolverArgs(methodTypeName, 'update', Queries.fields, rules),
                                    mutation: findResolverArgs(methodTypeName, 'update', Mutations.fields, rules)
                                },
                                allowed: checkMethodPermission(methodTypeName, 'update', Mutations, rules)
                            },
                            remove: {
                                resolver: getResolverName(methodTypeName, 'remove', rules),
                                args: {
                                    query: findResolverArgs(methodTypeName, 'remove', Queries.fields, rules),
                                    mutation: findResolverArgs(methodTypeName, 'remove', Mutations.fields, rules)
                                },
                                allowed: checkMethodPermission(methodTypeName, 'remove', Mutations, rules)
                            }
                        },
                        fields: {}
                    };

                    methodTypeObject.fields.forEach(function (prop) {
                        if (prop &&
                            prop.name &&
                            prop.name.value &&
                            prop.type &&
                            prop.type.name &&
                            prop.type.name.value) {
                            if (prop.name.value !== 'Mutation' &&
                                prop.name.value !== 'Query') {
                                if (!shape[methodTypeName].listHeader.id[0] &&
                                    (prop.name.value === 'id' || prop.name.value === '_id')) {
                                    shape[methodTypeName].listHeader.id.push(prop.name.value);
                                }
                                if (!shape[methodTypeName].listHeader.title[0]) {
                                    shape[methodTypeName].listHeader.title.push(methodTypeObject.fields[1].name.value);
                                }

                                shape[methodTypeName].fields[prop.name.value] = {
                                    label: prop.name.value,
                                    fieldType: prop.type.name.value,
                                    inputType: resolveInputType(prop.type.name.value),
                                    inputControl: resolveInputControl(prop.type.name.value),
                                    disabled: !shape[methodTypeName].resolvers.update.args.mutation[prop.name.value],
                                    exclude: false
                                };
                            }
                        }
                    });
                }
            });
            res.send(applyRules(shape, rules));
        }
    };
};