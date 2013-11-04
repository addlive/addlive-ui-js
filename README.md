# AddLive UI JS Library


This project contains widget gallery to be used with the AddLive JS SDK.

For more details refer to http://www.addlive.com

## Building

To build the minimised library, the project uses Apache Ant.

There is a single build step required to generate the library:

`ant -propertyfile conf/build.properties compile`

## Widgets


Currently following widgets are provided:

### Setup Assistant

Widget allowing one to easily bootstrap any user to use the AddLive SDK.
Contains all the steps necessary for user onboarding:

1) Optional installation of the AddLive plug-in
2) Platform initialisation
3) System checks (connectivity, CPU)
4) Devices configuration (camera, microphone and speakers)

The SetupAssistant replaced the call to ADL.initPlatform method
(http://api.addlive.com/stable/apidocs/ADL.html#initPlatform).
