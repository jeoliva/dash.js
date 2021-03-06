/**
 * The copyright in this software is being made available under the BSD License,
 * included below. This software may be subject to other third party and contributor
 * rights, including patent rights, and no such rights are granted under this license.
 *
 * Copyright (c) 2013, Dash Industry Forum.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *  * Redistributions of source code must retain the above copyright notice, this
 *  list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright notice,
 *  this list of conditions and the following disclaimer in the documentation and/or
 *  other materials provided with the distribution.
 *  * Neither the name of Dash Industry Forum nor the names of its
 *  contributors may be used to endorse or promote products derived from this software
 *  without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS AS IS AND ANY
 *  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 *  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 *  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 *  NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 *  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */
import FetchLoader from './FetchLoader';
import HeadRequest from './vo/HeadRequest';
import DashJSError from './vo/DashJSError';
import EventBus from './../core/EventBus';
import Events from './../core/events/Events';
import FactoryMaker from '../core/FactoryMaker';

const FRAGMENT_LOADER_ERROR_LOADING_FAILURE = 1;
const FRAGMENT_LOADER_ERROR_NULL_REQUEST = 2;
const FRAGMENT_LOADER_MESSAGE_NULL_REQUEST = 'request is null';

function FragmentLoader(config) {

    const context = this.context;
    const eventBus = EventBus(context).getInstance();

    let instance,
        loader;

    function setup() {
        loader = FetchLoader(context).create({
            errHandler: config.errHandler,
            metricsModel: config.metricsModel,
            mediaPlayerModel: config.mediaPlayerModel,
            requestModifier: config.requestModifier
        });
    }

    function checkForExistence(request) {
        const report = function (success) {
            eventBus.trigger(
                Events.CHECK_FOR_EXISTENCE_COMPLETED, {
                    request: request,
                    exists: success
                }
            );
        };

        if (request) {
            let headRequest = new HeadRequest(request.url);

            loader.load({
                request: headRequest,
                success: function () {
                    report(true);
                },
                error: function () {
                    report(false);
                }
            });
        } else {
            report(false);
        }
    }

    function load(request) {
        const report = function (event, data, error) {
            eventBus.trigger(event, {
                request: request,
                response: data || null,
                error: error || null,
                sender: instance
            });
        };

        if (request) {
            loader.load({
                request: request,
                progress: function (data) {
                    report(Events.LOADING_PROGRESS, data);
                },
                success: function (data) {
                    report(Events.LOADING_COMPLETED, data);
                },
                error: function (xhr, statusText, errorText) {
                    report(Events.LOADING_COMPLETED, undefined,
                        new DashJSError(FRAGMENT_LOADER_ERROR_LOADING_FAILURE, errorText, statusText));
                }
            });
        } else {
            report(Events.LOADING_COMPLETED, undefined,
                new DashJSError(FRAGMENT_LOADER_ERROR_NULL_REQUEST, FRAGMENT_LOADER_MESSAGE_NULL_REQUEST));
        }
    }

    function abort() {
        if (loader) {
            loader.abort();
        }
    }

    function reset() {
        if (loader) {
            loader.abort();
            loader = null;
        }
    }

    instance = {
        checkForExistence: checkForExistence,
        load: load,
        abort: abort,
        reset: reset
    };

    setup();

    return instance;
}

FragmentLoader.__dashjs_factory_name = 'FragmentLoader';

const factory = FactoryMaker.getClassFactory(FragmentLoader);
factory.FRAGMENT_LOADER_ERROR_LOADING_FAILURE = FRAGMENT_LOADER_ERROR_LOADING_FAILURE;
factory.FRAGMENT_LOADER_ERROR_NULL_REQUEST = FRAGMENT_LOADER_ERROR_NULL_REQUEST;
FactoryMaker.updateClassFactory(FragmentLoader.__dashjs_factory_name, factory);
export default factory;
