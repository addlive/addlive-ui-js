(function () {
  'use strict';

  // Imports
  var UI = ADL.UI,
      $ = UI.jQuery;

  // Consts

  /**
   * Minimal average round trip time to streaming server that makes the
   * connection fine.
   */
  var
      TEMPLATE_PATH = '/html/setup_assistant.html',
      _$saBox = null,
      _options,
      _devsResult = {},
      _activated = false,
      _serviceReady = false,
      _targetListener,
      _bodyHeight, _bodyOverflow;


  // Public API

  /**
   *
   *
   * @summary Initializes the platform using SetupAssistant when necessary
   * @since 1.0.0
   * @see ADL.initPlatform
   * @param {ADL.PlatformInitListener}initListener
   *          Initialization listener that will receive all the initialization
   *          events as with usual platform initialisation
   * @param {Object} options
   *          Initialisation options. Includes the default platform
   *          initialisation options as well as some SetupAssistant - specific
   *          properties.
   * @param {Object} options.platformOptions
   *          Platform initialisation options, that will be passed to
   *          {@link ADL.initPlatform}.
   * @param {Boolean} [options.alwaysShow=false]
   *          Boolean flag defining whether the setup assistant should be
   *          displayed only when installation is required (=false, default) or
   *          always.
   * @param {Object} options.testConnDescr
   * @param {Object} options.linkQualityConnDescr
   * @param {String} [options.label]
   * @param {String} [options.labelUrl]
   * @param {String} [options.templateUrl]
   */
  function initPlatform(initListener, options) {
    _options = options;
    _targetListener = initListener;
    var proxyListener = _getProxyInitListener();
    ADL.initPlatform(proxyListener, options.platformOptions);
  }


  // Private helpers

  function $$(selector) {
    return _$saBox.find(selector);
  }

  function _getProxyInitListener() {
    var proxyInitListener = new ADL.PlatformInitListener();
    proxyInitListener.onInitProgressChanged = function (e) {
      _targetListener.onInitProgressChanged(e);
    };

    /**
     *
     * @param {ADL.InitStateChangedEvent}e
     */
    proxyInitListener.onInitStateChanged = function (e) {
      switch (e.state) {
        case ADL.InitState.INSTALLATION_REQUIRED:
          // If the installation is needed - always show the setup assistant
          _initUI(e.installerURL);
          break;
        case ADL.InitState.INSTALLATION_COMPLETE:
          _showPlatformInitPage();
          break;
        case ADL.InitState.INITIALIZED:
          if (_activated) {
            _showConnectivityCheckPage();
            // Return here as we don't want to pass this event to target
            // listener directly
            return;
          }
          break;
        case ADL.InitState.DEVICES_INIT_BEGIN:
          _serviceReady = true;
          if (_options.alwaysShow) {
            _initUI();
          }
          break;
      }
      _targetListener.onInitStateChanged(e);
    };
    return proxyInitListener;
  }

  function _cancel() {

    ADL.UI.SADevicesSetup.terminate();
    ADL.UI.SAConnectivity.terminate();

    if (_serviceReady) {
      _done();
    } else {
      _disposeUI();
      var notificationE = new ADL.InitStateChangedEvent(
          ADL.InitState.ERROR,
          undefined,
          UI.ErrorCodes.USER_INTERRUPTION,
          'User cancelled the installation before the SDK was ready');
      _targetListener.onInitStateChanged(notificationE);
      _targetListener.onInitProgressChanged(100);
    }

  }

  function _done() {
    _disposeUI();
    var notificationE = new ADL.InitStateChangedEvent(ADL.InitState.INITIALIZED);

    // Apply the devices configuration results - if any
    $.each(_devsResult, function (k, v) {
      notificationE[k] = v;
    });
    _targetListener.onInitStateChanged(notificationE);
    _targetListener.onInitProgressChanged(100);
  }

  function _disposeUI() {
    _$saBox.remove();
    $(document.body).css({height:_bodyHeight, overflow:_bodyOverflow});

  }

  function _initUI(installerUrl) {
    // Init the UI only once.
    if (_activated) {
      return;
    }

    _activated = true;
    var onGet = function (data) {
          // Embed the template on site and do basic initialisation
          window.scrollTo(0, 0);

          _bodyHeight = $(document.body).css('height');
          _bodyOverflow = $(document.body).css('overflow');
          $(document.body).css({height:'100%', overflow:'hidden'});
          $(document.body).append($(data));
          _$saBox = $('#adlSetupAssistant');
          $$('.btn-cancel').click(_cancel);
          if (_options.label) {
            $$('.adl-label').text(_options.label);
            $$('a.adl-label').attr('href', _options.labelUrl);
          }

          // If the plug-in is already installed - we're done
          if (!installerUrl) {
            _showPlatformInitPage();
            return;
          }

          // Setup the installation page
          _$saBox.addClass(ADL.UI.ENV.os).addClass(ADL.UI.ENV.browser);
          $('.adl-page1').css('display', 'inline-block');
          $('.adl-footer1').css('display', 'block');
          $$('.btn-install').attr('href', installerUrl);

          if (ADL.UI.ENV.browser === 'firefox') {
            $$('.btn-install-main').
                attr('href', installerUrl).
                click(_showInstallInstrPage);
          } else {
            $$('.btn-install-main').click(function () {
              _showInstallInstrPage();
              setTimeout(function () {
                _$saBox.append(
                    '<iframe width="0" height="0" frameborder="0" src="' +
                        installerUrl + '"></iframe>');
              }, 100);
            });
          }

        },
        onErr = function () {
          _targetListener.onInitProgressChanged(100);
          var failureE = new ADL.InitStateChangedEvent(ADL.InitState.ERROR,
              undefined,
              ADL.ErrorCodes.Communication.NETWORK_ERROR,
              'Cannot initialize the SDK as plug-in installation is needed ' +
                  'but SDK failed to get the installer URL due to Internet ' +
                  'failure');
          _targetListener.onInitStateChanged(failureE);
        };

    var template = _options.templateURL || ADL.UI._ASSETS_ROOT + TEMPLATE_PATH;
    ADL.Utils.doGet(ADL.r(onGet, onErr), template);
  }

  // Pages navigation
  // ===========================================================================

  function _showPage(pageNo) {
    $$('.main').hide();
    $$('.footerContent').hide();
    $$('.adl-page' + pageNo).css('display', 'block');
    $$('.adl-footer' + pageNo).css('display', 'block');
  }

  function _showPlatformInitPage() {
    _showPage(3);
  }

  function _showInstallInstrPage() {
    _showPage(2);
  }

  function _showConnectivityCheckPage() {
    _showPage(4);
    UI.SAConnectivity.start(ADL.r(_showHWSetupPage), _options);
  }


  function _showHWSetupPage() {
    _showPage(5);
    UI.SADevicesSetup.start(ADL.r(_showDonePage), _options);
  }

  function _showDonePage(dR) {
    _devsResult = dR;
    _showPage(6);
    $$('.doneBtn').css('display', 'inline-block').click(_done);
  }

  function _detectBrowser() {
    var ua = window.navigator.userAgent;
    ADL.UI.ENV = {
      os:'other',
      browser:'browser-other'
    };
    if (/Windows/.test(ua)) {
      ADL.UI.ENV.os = 'win';
    } else if (/Intel Mac/.test(ua)) {
      ADL.UI.ENV.os = 'mac';
    }
    if (/Chrome/.test(ua)) {
      ADL.UI.ENV.browser = 'chrome';
    } else if (/Firefox/.test(ua)) {
      ADL.UI.ENV.browser = 'firefox';
    }
  }

  _detectBrowser();


  // Exports

  /**
   *
   * @type {Object}
   */
  UI.SetupAssistant = {
    $$:$$,
    initPlatform:initPlatform
  };

  /**
   *
   * @eum {String}
   */
  UI.ErrorCodes = {
    USER_INTERRUPTION:'USER_INTERRUPTION'
  };

}());
