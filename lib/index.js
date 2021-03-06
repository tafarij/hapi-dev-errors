'use strict'

const Fs = require('fs')
const Path = require('path')
const Hoek = require('hoek')
const Youch = require('youch')
const TemplatePath = Path.join(__dirname, './error.html')

exports.register = (server, options, next) => {

    // default option values
    const defaults = {
        showErrors: false,
        useYouch: false
    }

    // assign config object from merged options into defaults
    const config = Object.assign(defaults, options)

    // cut early if `showErrors` is false
    // no need to read the template or hook extension point
    if (!config.showErrors) {
        return next()
    }

    // require `vision` plugin in case the user provides an error template
    if (config.template) {
        server.dependency([ 'vision' ])
    }

    // read and keep the default error template
    const errorTemplate = Fs.readFileSync(TemplatePath, 'utf8')

    // extend the request lifecycle at `onPreResponse`
    // to change the default error handling behavior (if enabled)
    server.ext('onPreResponse', (request, reply) => {

        // response shortcut
        const response = request.response

        // only show `bad implementation` developer errors (status code 500)
        if (response.isDeveloperError) {
            const accept = request.raw.req.headers.accept
            const statusCode = response.output.payload.statusCode

            const errorResponse = {
                title: response.output.payload.error,
                statusCode: statusCode,
                message: response.message,
                method: request.raw.req.method,
                url: request.url.path,
                headers: request.raw.req.headers,
                payload: request.raw.req.method !== 'GET' ? request.payload : '',
                stacktrace: response.stack.replace(/[a-z_-\d]+.js:\d+:\d+/gi, '<mark>$&</mark>')
            }

            // take priority: check header if there’s a JSON REST request
            if (accept && accept.match(/json/)) {
                return reply(errorResponse).code(statusCode)
            }

            // did the user explicitly specify an error template
            // this is high priority: custom template overrides any other template
            if (config.template) {
                return reply.view(config.template, errorResponse).code(statusCode)
            }

            // user wants to use Youch over the default template
            if (config.useYouch) {
                // clone the request to not change it
                const req = Hoek.clone(request)

                // assign the url’s path to "url" property of request directly
                // hapi uses a URL object and Youch wants the path directly
                req.url = req.path
                // assign httpVersion -> same as with request.url
                req.httpVersion = req.raw.req.httpVersion

                // create new Youch instance and reply rendered HTML
                const youch = new Youch(response, req)
                return youch.toHTML().then(response => {
                    return reply(response).code(statusCode)
                })
            }

            // prepare the error template and replace `%placeholder%` with error specific details
            const responseHtml = errorTemplate.replace(/%(\w+)%/g, (full, token) => {
                return errorResponse[ token ] || ''
            })

            // go with the default template, because no user template is defined and Youch isn’t selected
            return reply(responseHtml).code(statusCode)
        }

        // go ahead with the response, no developer error detected
        return reply.continue()
    })

    next()
}

exports.register.attributes = {
    pkg: require('../package.json')
}
