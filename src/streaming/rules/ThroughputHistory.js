/**
 * The copyright in this software is being made available under the BSD License,
 * included below. This software may be subject to other third party and contributor
 * rights, including patent rights, and no such rights are granted under this license.
 *
 * Copyright (c) 2017, Dash Industry Forum.
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

//import Constants from '../constants/Constants';
import FactoryMaker from '../../core/FactoryMaker.js';

// throughput generally stored in kbit/s
// latency generally stored in ms

function ThroughputHistory(config) {

    const MAX_MEASUREMENTS_TO_KEEP = 20;
    const AVERAGE_THROUGHPUT_SAMPLE_AMOUNT_LIVE = 3;
    const AVERAGE_THROUGHPUT_SAMPLE_AMOUNT_VOD = 4;
    const AVERAGE_LATENCY_SAMPLE_AMOUNT = 4;
    // const CACHE_LOAD_THRESHOLD_VIDEO = 50;
    // const CACHE_LOAD_THRESHOLD_AUDIO = 5;
    const THROUGHPUT_DECREASE_SCALE = 1.3;
    const THROUGHPUT_INCREASE_SCALE = 1.3;

    const mediaPlayerModel = config.mediaPlayerModel;

    let throughputDict,
        latencyDict;

    function setup() {
        reset();
    }

    // function isCachedResponse(mediaType, latencyMs, downloadTimeMs) {
    //     if (mediaType === Constants.VIDEO) {
    //         return downloadTimeMs < CACHE_LOAD_THRESHOLD_VIDEO;
    //     } else if (mediaType === Constants.AUDIO) {
    //         return downloadTimeMs < CACHE_LOAD_THRESHOLD_AUDIO;
    //     }
    // }

    function push(mediaType, httpRequest, useDeadTimeLatency) {
        if (!httpRequest.trace || !httpRequest.trace.length) {
            return;
        }

        const latencyTimeInMilliseconds = (httpRequest.tresponse.getTime() - httpRequest.trequest.getTime()) || 1;
        const downloadTimeInMilliseconds = httpRequest.trace.reduce((a, b) => a + b.d, 0) || 1; //Make sure never 0 we divide by this value. Avoid infinity!
        const downloadBytes = httpRequest.trace.reduce((a, b) => a + b.b[0], 0);
        const throughputMeasureTime = useDeadTimeLatency ? downloadTimeInMilliseconds : latencyTimeInMilliseconds + downloadTimeInMilliseconds;

        throughputDict[mediaType] = throughputDict[mediaType] || [];
        latencyDict[mediaType] = latencyDict[mediaType] || [];

        // if (isCachedResponse(mediaType, latencyTimeInMilliseconds, downloadTimeInMilliseconds)) {
        //     if (throughputDict[mediaType].length > 0 && !throughputDict[mediaType].hasCachedEntries) {
        //         // already have some entries which are not cached entries
        //         // prevent cached fragment loads from skewing the average values
        //         return;
        //     } else { // have no entries || have cached entries
        //         // no uncached entries yet, rely on cached entries because ABR rules need something to go by
        //         throughputDict[mediaType].hasCachedEntries = true;
        //     }
        // } else if (throughputDict[mediaType] && throughputDict[mediaType].hasCachedEntries) {
        //     // if we are here then we have some entries already, but they are cached, and now we have a new uncached entry
        //     throughputDict[mediaType] = [];
        //     latencyDict[mediaType] = [];
        // }

        throughputDict[mediaType].push({bit: 8 * downloadBytes, ms: throughputMeasureTime});
        if (throughputDict[mediaType].length > MAX_MEASUREMENTS_TO_KEEP) {
            throughputDict[mediaType].shift();
        }

        latencyDict[mediaType].push(latencyTimeInMilliseconds);
        if (latencyDict[mediaType].length > MAX_MEASUREMENTS_TO_KEEP) {
            latencyDict[mediaType].shift();
        }
    }

    function getSamples(isThroughput, mediaType, isLive) {
        let arr;
        let sampleSize;

        if (isThroughput) {
            arr = throughputDict[mediaType];
            sampleSize = isLive ? AVERAGE_THROUGHPUT_SAMPLE_AMOUNT_LIVE : AVERAGE_THROUGHPUT_SAMPLE_AMOUNT_VOD;
        } else {
            arr = latencyDict[mediaType];
            sampleSize = AVERAGE_LATENCY_SAMPLE_AMOUNT;
        }

        if (!arr) {
            sampleSize = 0;
        } else if (sampleSize >= arr.length) {
            sampleSize = arr.length;
        } else if (isThroughput) {
            // if throughput samples vary a lot, average over a wider sample
            for (let i = 1; i < sampleSize; ++i) {
                let ratio = arr[-i] / arr[-i - 1];
                if (ratio >= THROUGHPUT_INCREASE_SCALE || ratio <= 1 / THROUGHPUT_DECREASE_SCALE) {
                    sampleSize += 1;
                    if (sampleSize === arr.length) { // cannot increase sampleSize beyond arr.length
                        break;
                    }
                }
            }
        }

        return (sampleSize === 0 || !arr || arr.length === 0) ? [] : arr.slice(-sampleSize);
    }

    function getAverageThroughput(mediaType, isDynamic) {
        let samples = getSamples(true, mediaType, isDynamic);

        if (samples) {
            let [bits, milliseconds] = samples.reduce(([a, b], {bit, ms}) => [a + bit, b + ms], [0,0]);
            return Math.round(bits / milliseconds); // bit/ms = kbit/s
        } else {
            return NaN;
        }
    }

    function getSafeAverageThroughput(mediaType, isDynamic) {
        return getAverageThroughput(mediaType, isDynamic) * mediaPlayerModel.getBandwidthSafetyFactor();
    }

    function getAverageLatency(mediaType) {
        let samples = getSamples(false, mediaType);
        if (samples) {
            return samples.reduce((total, elem) => total + elem, 0) / samples.length;
        } else {
            return NaN;
        }
    }

    function reset() {
        throughputDict = {};
        latencyDict = {};
    }

    const instance = {
        push: push,
        getAverageThroughput: getAverageThroughput,
        getSafeAverageThroughput: getSafeAverageThroughput,
        getAverageLatency: getAverageLatency,
        reset: reset
    };

    setup();
    return instance;
}

ThroughputHistory.__dashjs_factory_name = 'ThroughputHistory';
let factory = FactoryMaker.getClassFactory(ThroughputHistory);
export default factory;
