/**
 The MIT License (MIT)

 Copyright (c) 2013 LiveFoundry Inc.

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

 */

/**
 * @fileoverview
 * Single class source - contains definition of the AddLiveService class.
 *
 * @author Tadeusz Kozak
 * @date 6/5/13 2:49 PM
 */

(function () {
  'use strict';

  // Imports

  var $ = ADL.UI.$,
      $$, // Lazy init
      Log = ADL.Log;

  // Constants, enums
  var AVG_RTT_OK = 300,

      ConnHwItemStatus =
      {
        BAD:'invalid',
        WARN:'warning',
        OK:'valid',
        PENDING:'loading',
        SKIPPED:'skipped'
      },
      /**
       * How long the sample connection should last.
       */
          RTT_TEST_DURATION = 15000,

      CLOCK_MAP = {
        1:{warn:2500, ok:Number.MAX_VALUE},
        2:{warn:1700, ok:2500},
        3:{warn:1700, ok:2500},
//          Any 4 cores CPU will do the job
        4:{ok:0}
      },

  // Explicit CPU white and black listing
      WARN_CPU_PATTERNS = [
        /Atom/
      ],

      BAD_CPU_PATTERNS = [
        /Pentium III/,
        /Pentium II/
      ],

      OK_CPU_PATTERNS = [
        /i5/, // Intel core i5
        /i7/ // Intel core i7
      ];


  // Scope variables
  var connHwTestOverallResult = ConnHwItemStatus.OK,
      scopeId,
      authDetails,
      responder,
      rtts = [],
      linkQualityConnDescr,
      terminated = false;


  function start(r, options) {
    terminated = false;
    $$ = ADL.UI.SetupAssistant.$$;
    authDetails = options.testConnDescr.authDetails;
    scopeId = options.testConnDescr.scopeId;
    linkQualityConnDescr = options.linkQualityConnDescr;
    responder = r;
    var listener = new ADL.AddLiveServiceListener();
    listener.onMediaConnTypeChanged = _onMediaConnTypeChanged;
    listener.onMediaStats = _onMediaStats;

//      Register the listener
    ADL.getService().addServiceListener(ADL.r(), listener);
    _testCpu();
    _initTestConn();
  }

  function terminate() {
    try {
      // It may fail if the cancel will be requested before the plug-in
      // installation - in this case ADL.getService() will return undefined.
      ADL.getService().disconnect(ADL.r(), scopeId);
    } catch (exc) {

    }
    terminated = true;
  }

  function _setConnHwTestStatus(newStatus) {
    if (connHwTestOverallResult === ConnHwItemStatus.BAD) {
      return;
    }
    if (newStatus === ConnHwItemStatus.OK) {
      return;
    }
    connHwTestOverallResult = newStatus;
  }


  function _testCpu() {
    if (terminated) {
      return;
    }
    Log.d('Testing the CPU');
    var $cpuTest = $$('.cpuTest');

    var onHostDetails = function (info) {

      var cpuStatus = _rateCPU(info);
      $cpuTest.find('.cpuInfo').text(info.brand_string);
      _setPartialResult($cpuTest, cpuStatus);

      Log.d('CPU Test complete');
      _setConnHwTestStatus(cpuStatus);
    }, onHostDetailsErr = function () {
      $cpuTest.hide();
      $$('.cpuErr').show();
      _setConnHwTestStatus(ConnHwItemStatus.WARN);
    };
    ADL.getService().getHostCpuDetails(ADL.r(onHostDetails, onHostDetailsErr));
  }

  function _rateCPU(info) {
    var cpuStatus = ConnHwItemStatus.BAD;
    if (CLOCK_MAP[info.cores] !== undefined) {
      if (info.clock > CLOCK_MAP[info.cores].ok) {
        cpuStatus = ConnHwItemStatus.OK;
      } else if (info.clock > CLOCK_MAP[info.cores].warn) {
        cpuStatus = ConnHwItemStatus.WARN;
      }
    } else if (info.cores > 4) {
      cpuStatus = ConnHwItemStatus.OK;
    }
    $.each(WARN_CPU_PATTERNS, function (i, pattern) {
      if (info.brand_string.match(pattern)) {
        cpuStatus = ConnHwItemStatus.WARN;
      }
    });

    $.each(BAD_CPU_PATTERNS, function (i, pattern) {
      if (info.brand_string.match(pattern)) {
        cpuStatus = ConnHwItemStatus.BAD;
      }
    });
    $.each(OK_CPU_PATTERNS, function (i, pattern) {
      if (info.brand_string.match(pattern)) {
        cpuStatus = ConnHwItemStatus.OK;
      }
    });
    return cpuStatus;
  }

  function _initTestConn() {
    if (terminated) {
      return;
    }
    Log.d('Establishing RTT test connection');
    var connDescriptor = {
      scopeId:scopeId,
      authDetails:authDetails,
      publishVideo:false,
      publishAudio:true
    };
    ADL.getService().connect(ADL.r(_onConnected, _onConnErr), connDescriptor);
  }

  function _onConnected() {
    if (terminated) {
      ADL.getService().disconnect(ADL.r(), scopeId);
    }
    Log.d('RTT test connection established. Polling stats');
    _setPartialResult($$('.connTest'), ConnHwItemStatus.OK);
    ADL.getService().startMeasuringStatistics(ADL.r(), scopeId, 1);
    _testLinkQuality();
    setTimeout(_connAndRTTTestComplete, RTT_TEST_DURATION);
  }

  function _onConnErr() {
    Log.w('Failed to connect');

    _setPartialResult($$('.connTest'), ConnHwItemStatus.BAD);
    _failAllConnTests();
  }

  function _failAllConnTests() {
    $$('.connectivity-test').
        removeClass(ConnHwItemStatus.PENDING).
        addClass(ConnHwItemStatus.SKIPPED);

    // TODO
    $$('.connectingMsg').html('No Internet connection');
    _onConnectivityTestComplete();
  }

  function _connAndRTTTestComplete() {
    ADL.getService().disconnect(ADL.r(), scopeId);
    _testRTT();
  }


  function _testLinkQuality() {
    if (terminated) {
      return;
    }
    ADL.getService().networkTest(
        ADL.r(_onLinkQualityTestResult, _onLinkQualityTestError),
        linkQualityConnDescr);
  }

  function _onLinkQualityTestResult(qualityResult) {
    if (terminated) {
      return;
    }
    var testResult;

    if (qualityResult !== ADL.ConnectionQuality.FINE) {
      testResult = ConnHwItemStatus.WARN;
    } else {
      testResult = ConnHwItemStatus.OK;
    }
    _setPartialResult($$('.bandwithTest'), testResult);

    // TODO
    $$('.connectingMsg').html('Connection checked');
    _onConnectivityTestComplete();
  }

  function _onLinkQualityTestError() {
    _setPartialResult($$('.bandwithTest'), ConnHwItemStatus.WARN);

    // TODO
    $$('.connectingMsg').html('Connection checked');
    _onConnectivityTestComplete();
  }


  function _onConnectivityTestComplete() {
    if (terminated) {
      return;
    }
    if (connHwTestOverallResult === ConnHwItemStatus.OK) {
      $$('.goToPage5Btn').
          html('<a href="javascript://nop" class="btn-action">Next ></a>').
          click(_complete);
    } else {
      $$('.goToPage5Btn').
          html('<a href="javascript://nop" class="btn-action">' +
          'I\'ll continue anyway</a>')
          .click(_complete);
    }
    $$('.goToPage5Btn').parent().addClass('btn-holder');
    $$('.goToPage5Btn').next().removeClass();
  }

  function _onMediaStats(e) {
    if (e.mediaType === ADL.MediaType.AUDIO) {
      Log.d('Got media stats');
      rtts.push(e.stats.rtt);
    }
  }

  /**
   *
   * @param {ADL.MediaConnTypeChangedEvent}e
   */
  function _onMediaConnTypeChanged(e) {
    var $infoContainer,
        result;
    if (e.mediaType === ADL.MediaType.AUDIO) {
      $infoContainer = $$('.connTypeAudioTest');
    } else {
      $infoContainer = $$('.connTypeVideoTest');
    }
    switch (e.connectionType) {
      case ADL.ConnectionType.UDP_RELAY:
        result = ConnHwItemStatus.OK;
        break;
      case ADL.ConnectionType.TCP_RELAY:
        result = ConnHwItemStatus.WARN;
        break;
    }
    _setPartialResult($infoContainer, result);
  }

  function _testRTT() {
    var $infoContainer = $$('.distanceTest'),
        avgRtt = 0,
        result;

    $.each(rtts, function (i, rtt) {
      avgRtt += parseInt(rtt, 10);
    });
    avgRtt /= rtts.length;

    if (avgRtt > AVG_RTT_OK) {
      result = ConnHwItemStatus.WARN;
    } else {
      result = ConnHwItemStatus.OK;
      $infoContainer.find('.rttInfo').text(Math.floor(avgRtt));
    }
    _setPartialResult($infoContainer, result);
  }

  function _setPartialResult($container, result) {

    // If it's already bad - don't do anything
    if (connHwTestOverallResult !== ConnHwItemStatus.BAD) {

      // If it's ok - don't set it as it's the default value and we don't want
      // to go from warn to OK
      if (result !== ConnHwItemStatus.OK) {
        connHwTestOverallResult = result;
      }
    }
    $container.removeClass('loading').addClass(result);
  }

  function _complete() {
    responder.result();
  }


  ADL.UI.SAConnectivity = {
    start:start,
    terminate:terminate
  };

}());