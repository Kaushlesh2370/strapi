'use strict';

const Router = require('@koa/router');
const { has } = require('lodash/fp');
const { yup } = require('@strapi/utils');

const createEndpointComposer = require('./compose-endpoint');

const policyOrMiddlewareSchema = yup.lazy(value => {
  if (typeof value === 'string') {
    return yup.string().required();
  }

  if (typeof value === 'function') {
    return yup.mixed().isFunction();
  }

  return yup.object({
    name: yup.string().required(),
    options: yup.object().notRequired(), // any options
  });
});

const routeSchema = yup.object({
  method: yup
    .string()
    .oneOf(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'ALL'])
    .required(),
  path: yup.string().required(),
  handler: yup.lazy(value => {
    if (typeof value === 'string') {
      return yup.string().required();
    }

    if (Array.isArray(value)) {
      return yup.array().required();
    }

    return yup
      .mixed()
      .isFunction()
      .required();
  }),
  config: yup
    .object({
      policies: yup
        .array()
        .of(policyOrMiddlewareSchema)
        .notRequired(),
      middlwares: yup
        .array()
        .of(policyOrMiddlewareSchema)
        .notRequired(),
    })
    .notRequired(),
});

const validateRouteConfig = routeConfig => {
  try {
    return routeSchema.validateSync(routeConfig, {
      strict: true,
      abortEarly: false,
      stripUnknown: true,
    });
  } catch (error) {
    throw new Error('Invalid route config', error.message);
  }
};

const createRouteManager = (strapi, opts = {}) => {
  const composeEndpoint = createEndpointComposer(strapi);

  const createRoute = (route, router) => {
    validateRouteConfig(route);

    if (opts.defaultPolicies && has('config.policies', route)) {
      route.config.policies.unshift(...opts.defaultPolicies);
    }

    composeEndpoint(route, { ...route.info, router });
  };

  const addRoutes = (routes, router) => {
    if (Array.isArray(routes)) {
      routes.forEach(route => createRoute(route, router));
    } else if (routes.routes) {
      const subRouter = new Router({ prefix: routes.prefix });

      routes.routes.forEach(route => {
        const hasPrefix = has('prefix', route.config);
        createRoute(route, hasPrefix ? router : subRouter);
      });

      return router.use(subRouter.routes(), subRouter.allowedMethods());
    }
  };

  return {
    addRoutes,
  };
};

module.exports = {
  validateRouteConfig,
  createRouteManager,
};
