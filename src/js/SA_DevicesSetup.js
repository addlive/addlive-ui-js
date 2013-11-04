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
 * @date 6/5/13 3:18 PM
 */

(function () {
  'use strict';

  // Imports
  var $ = ADL.UI.$,
      $$;

  // Consts
  var /**
       * How long the microphone test should last.
       */
          MIC_TEST_DURATION = 8000,

      /**
       * Minimal mic activity to assume that the sample contained proper mic
       * input.
       */
          MIC_TEST_MIN_ACTIVITY = 20;

  // Scope variables
  var responder,
      micTimeout,
      camFunctional = false,
      micFunctional = false,
      spkFunctional = false,
      terminated = false;

  function start(r) {
    $$ = ADL.UI.SetupAssistant.$$;

    responder = r;

    // Define handlers for the devices selection change
    $$('.camSelect').change(_onCamSelected);
    $$('.micSelect').change(_onMicSelected);
    $$('.spkSelect').change(_onSpkSelected);

    // Define handlers for the skip buttons
    $$('.skipCam').click(_camTestSkipped);
    $$('.skipMic').click(_micTestSkipped);
    $$('.skipSpk').click(_spkTestSkipped);

    // Define the handlers for retry buttons
    $$('.micTestAgainBtn').click(_startMicTest);
    $$('.camTestAgainBtn').click(_startCamTest);

    // Setup devices controls (volume, mic activity and play test sound btn)
    $$('.playTestSoundBtn').click(_onPlayTestSoundBtnClicked);
    $$('.micActivityBar').progressbar({value:10});
    $$('.volumeCtrlSlider').slider({
      min:0,
      max:255,
      animate:true,
      value:127,
      slide:_onVolumeSlide
    });

//      Define the AddLiveServiceListener and register it
    var listener = new ADL.AddLiveServiceListener();
    listener.onDeviceListChanged = onDeviceListChanged;
    listener.onMicActivity = _onMicActivity;
    ADL.getService().addServiceListener(ADL.r(), listener);

    // Populate the devices to inputs and start the cam test when ready
    _populateDevices(_startCamTest);
  }

  function terminate() {
    try {
      terminated = true;
      _camTestSkipped();
      _micTestSkipped();
      _spkTestSkipped();
    } catch (exc) {

    }
  }

  /**
   * =========================================================================
   * Step 1. Camera.
   * =========================================================================
   */

  function _startCamTest() {
    if (terminated) {
      return;
    }
    var $camSetupStepWrapper = $$('.camSetupStepWrapper'),
        $renderContainer = $$('.camPreviewRenderer'),
        containerId = 'adlSaRenderContainer' + (new Date().getTime()),

        localPrevStarted = function (sinkId) {
          if (camTestComplete) {
            ADL.getService().stopLocalVideo(ADL.r());
          } else {
            $$('.camNextBtn').removeClass('disabled').click(_camTestSucc);
            ADL.renderSink({sinkId:sinkId, containerId:containerId});
            $$('.camMessage').hide();
            $$('.camSucc').show();
          }
        },
        camSelectedSuccHandler = function () {
          camFunctional = true;
          if (!camTestComplete) {
            ADL.getService().startLocalVideo(ADL.r(localPrevStarted));
          }
        },
        camSelectedErrHandler = function () {
          $camSetupStepWrapper.find('.camMessage').hide();
          $camSetupStepWrapper.find('.camError').show();
        };

    $$('.camMessage').show();
    $$('.camSucc').hide();
    $$('.camError').hide();
    $renderContainer.attr('id', containerId);
    ADL.getService().setVideoCaptureDevice(
        ADL.r(camSelectedSuccHandler, camSelectedErrHandler),
        $$('.camSelect').val());
  }


  /**
   * Handles the change event of the video capture devices select.
   */
  function _onCamSelected() {
    $$('.camNextBtn').addClass('disabled').unbind('click');
    _startCamTest();
  }

  function _camTestSucc() {
    _camTestComplete(true);
  }

  var camTestComplete = false;

  function _camTestComplete(result) {
    ADL.getService().stopLocalVideo(ADL.r());
    if (result) {
      $$('.camSetupStepWrapper').addClass('valid');
    } else {
      $$('.camSetupStepWrapper').addClass('warning');
    }
    $$('.skipCamWrapper').hide();
    $$('.camNextBtn').addClass('disabled').unbind('click');
    camTestComplete = true;
    _startMicTest();
  }

  function _camTestSkipped() {
    _camTestComplete(false);
  }


  /**
   * ===========================================================================
   * Step 2. Microphone
   * ===========================================================================
   */

  /**
   * Handles the change event of the audio capture devices select.
   */
  function _onMicSelected() {
    _startMicTest();
  }

  function _startMicTest() {
    if (terminated) {
      return;
    }
    $$('.micSetupStepWrapper').show();
    $$('.micMsg').show();
    $$('.micError').hide();
    $$('.micSucc').hide();

    var selectedMic = $$('.micSelect').val(),
        micSelectedSuccHandler = function () {
          // Set the mic gain to half of the range avail
          micFunctional = true;
          ADL.getService().setMicrophoneVolume(ADL.r(), 125);
          ADL.getService().monitorMicActivity(ADL.r(), true);
          micTimeout = setTimeout(_onMicTimeout, MIC_TEST_DURATION);
        },
        micSelectedErrHandler = function () {
          micFunctional = false;
          $$('.micMsg').hide();
          $$('.micError').show();

        };

    // Disable the "it's working button"
    $$('.micNextBtn').
        unbind('click').
        addClass('disabled');

    ADL.getService().setAudioCaptureDevice(
        ADL.r(micSelectedSuccHandler, micSelectedErrHandler), selectedMic);
  }

  var micTestComplete = false;

  function _onMicTimeout(activityOk) {
    if (micTestComplete) {
      return;
    }
    $$('.micMsg').hide();
    if (activityOk) {
      $$('.micNextBtn').click(function () {
        _micTestComplete(true);
      }).removeClass('disabled');
      $$('.micError').hide();
      $$('.micSucc').show();
    } else {
      $$('.micError').show();
    }
  }

  function _micTestSkipped() {
    _micTestComplete(false);
  }

  function _micTestComplete(result) {
    ADL.getService().monitorMicActivity(ADL.r(), false);
    micTestComplete = true;
    if (result) {
      $$('.micSetupStepWrapper').addClass('valid');
    } else {
      $$('.micSetupStepWrapper').addClass('warning');
    }
    $$('.micNextBtn').addClass('disabled').unbind('click');
    $$('.skipMicWrapper').hide();
    _startSpkTest();
  }

  function _onMicActivity(e) {
    if (!micTestComplete) {
      $$('.micActivityBar').progressbar('value', e.activity / 255 * 100);
      if (e.activity > MIC_TEST_MIN_ACTIVITY) {
        clearTimeout(micTimeout);
        _onMicTimeout(true);
      }
    }
  }


  /**
   * =========================================================================
   * Step 3. Speakers.
   * =========================================================================
   */

  function _onSpkSelected() {
    _startSpkTest();
  }

  function _startSpkTest() {
    if (terminated) {
      return;
    }
    var selectedSpk = $$('.spkSelect').val(),
        spkSelectSuccHandler = function () {
          spkFunctional = true;
          var resultHandler = function (volume) {
            $$('.volumeCtrlSlider').slider('value', volume);
          };
          ADL.getService().getSpeakersVolume(ADL.r(resultHandler));
        },
        spkSelectErrHandler = function () {
          spkFunctional = false;
          $$('.spkMsg').hide();
          $$('.spkError').show();
        };

    $$('.spkSetupStepWrapper').show();
    $$('.spkMsg').show();
    $$('.spkError').hide();
    $$('.spkSucc').hide();

    ADL.getService().setAudioOutputDevice(ADL.r(spkSelectSuccHandler,
        spkSelectErrHandler), selectedSpk);
  }

  function _spkTestComplete(result) {
    if (result) {
      $$('.spkSetupStepWrapper').addClass('valid');
    } else {
      $$('.spkSetupStepWrapper').addClass('warning');
    }

    $$('.spkNextBtn').addClass('disabled').unbind('click');
    $$('.playTestSoundBtn').addClass('disabled').unbind('click');
    $$('.skipSpkWrapper').hide();
    _gotoPage6();
    return false;
  }

  function _spkTestSkipped() {
    _spkTestComplete(false);

  }

  function _onPlayTestSoundBtnClicked() {
    var onSuccHandler = function () {
      $$('.spkNextBtn').
          removeClass('disabled').
          click(function () {
            _spkTestComplete(true);
          });
      $$('.spkMsg').hide();
      $$('.spkSucc').show();
    };
    var onErrHandler = function () {
      $$('.spkMsg').hide();
      $$('.spkError').show();
    };
    ADL.getService().startPlayingTestSound(
        ADL.r(onSuccHandler, onErrHandler));
  }

  //noinspection JSUnusedLocalSymbols
  function _onVolumeSlide(e, ui) {
    ADL.getService().setSpeakersVolume(ADL.r(), ui.value);
  }

  function _gotoPage6() {
    $$('.goToPage6Btn').parent().addClass('btn-holder');
    $$('.goToPage6Btn').
        html('<a href="javascript://nop" class="btn-action">Next ></a>'
    ).click(_onComplete);
    $$('.goToPage6Btn').next().removeClass();
  }


  /**
   * Fills the selects with the currently plugged in devices.
   */
  function _populateDevices(doneHandler) {
    var steps = 3;
    var devReadyHandler = function () {
      steps -= 1;
      if (steps === 0) {
        doneHandler();
      }
    };
    _populateDevicesOfType('.camSelect', 'VideoCapture', devReadyHandler);
    _populateDevicesOfType('.micSelect', 'AudioCapture', devReadyHandler);
    _populateDevicesOfType('.spkSelect', 'AudioOutput', devReadyHandler);
  }

  /**
   * Fills the audio output devices select.
   */
  function _populateDevicesOfType(selectSelector, devType, readyHandler) {
    var devsResultHandler = function (devs) {
      var $select = $$(selectSelector);
      $select.empty();
      $.each(devs, function (devId, devLabel) {
        $('<option value="' + devId + '">' + devLabel + '</option>').
            appendTo($select);
      });
      var getDeviceHandler = function (device) {
        $select.val(device);
        readyHandler();
      };
      ADL.getService()['get' + devType + 'Device'](
          ADL.r(getDeviceHandler));
    };
    ADL.getService()['get' + devType + 'DeviceNames'](
        ADL.r(devsResultHandler));
  }

  function _onComplete() {
    responder.result({
      audioCaptureDevFunctional:micFunctional,
      videoCaptureDevFunctional:camFunctional,
      audioOutputDevFunctional:spkFunctional
    });
  }

  function onDeviceListChanged(e) {
    if (e.audioInChanged) {
      _populateDevicesOfType('.micSelect', 'AudioCapture');
    }
    if (e.audioOutChanged) {
      _populateDevicesOfType('.spkSelect', 'AudioOutput');
    }
    if (e.videoInChanged) {
      _populateDevicesOfType('.camSelect', 'VideoCapture');
    }
  }


  // Exports
  ADL.UI.SADevicesSetup = {start:start, terminate:terminate};

}());