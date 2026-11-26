# ZEISS ACCURA CMM Simulator

An independent interactive simulation of an ACCURA bridge CMM and its BP26SE-style console. It runs in a browser on desktop or iPhone and installs as a standalone web app. WebGL 2 enables reflective materials and dynamic shadows, with a software-rendered view available when WebGL is disabled. All machine motion, probing and the tool rack are simulated locally.

## Run or install

- [Open the simulator on GitHub Pages](https://owningturtle287.github.io/CMM-simulator-/)
- On iPhone, open the link in Safari, tap Share, then **Add to Home Screen**. Enable **Open as Web App** and tap **Add**. Open it online once so it is available offline.
- On desktop, use the same link. Chromium-based browsers offer installation through the address bar or browser menu.

To run from source, use Node.js 22.12 or later.

```sh
npm ci
npm run dev
npm test
npm run build
```

The **Deploy simulator to GitHub Pages** workflow tests and builds the app on pushes to `main` and on manual runs. Its publishing source is set in **Settings → Pages → Build and deployment → GitHub Actions**.

## Operation

- **Mobile Mode** runs the 3D view edge to edge in landscape and docks the controller along the bottom. Drag the left joystick for Z and the right joystick for X/Y. Both sticks, Quick Actions, and E-stop stay accessible in the **Jog**, **Functions**, and **Keypad** tabs. The Mobile Mode switch moves onto the controller and saves your preference. Touch devices enable the setting by default. Open **Machine information** for the point log, calibration results and the reference block toggle.
- Drag the right joystick for X and Y and the left joystick for Z. The desktop keys W/A/S/D and Q/E and the compact iPhone touch controls also jog the machine. The operating-position key rotates the X/Y assignment for the operator’s side.
- Scroll or pinch over the spot you want to inspect. Double-click or double-tap a machine part to center it and zoom in. Drag to orbit, or use right-drag or two fingers to pan.
- **M** toggles the drives. Pressing the mushroom latches the emergency stop immediately. Pressing it again simulates twisting it loose. The drives stay disabled until **M** is pressed. The joystick unlock buttons restore manual jogging after 60 seconds of inactivity.
- Open **Quick Actions → Change stylus system** and choose a stylus to run the rear-rack sequence in AUTO. The machine raises to clearance, returns the current 70 mm magnetic adapter plate by sliding it into the front of its VAST/MT socket, lifts the empty receiver, then couples to the requested plate and slides it back out at the same height. The Rack and Probe camera views show the transfer from the front of the rack and close to the moving head. **ESC** cancels travel. If the machine stops in a socket, another rack request or reference run starts by recovering clearance. The speed override also applies during automatic travel.
- **Quick Actions → Calibrate master probe** mounts the DK8 master, locates the fixed Ø30 mm ceramic sphere with a top contact and four upper-hemisphere contacts, then demonstrates Dynamic Tensor motion with slow and fast continuous equator scans. The result reports the fitted sphere center and diameter from the simulated contacts. The Probe view follows the stylus during the sequence.
- **M-Point** records the current 3D location. Clicking the center of the right joystick records an intermediate position. The included reference block supports a practice top-face contact at Z = 82 mm. The point log is kept for the current session.
- **Shift → Return → F12** starts C99 reference travel. **F5/F6** with the same prefix select AUTO/MAN. The console menu contains position, velocity, status, probe controls and travel direction locks. The X/Y/Z keys adjust probe clamping and measuring force in MAN, independently of the travel direction locks.
- Each of the six rack positions uses one straight-down stylus. The first is mounted on startup and position six holds the 63.5 mm ZEISS DK8 master stylus with an Ø8 mm ruby and Ø6 mm carbide shaft. The VAST XT gold is fixed to the ram and this configuration has no rotary table. Plain F1–F12 are host commands. Service-only controls and CALYPSO-dependent measurement programs, host shortcuts and scanning metrology are outside the scope of this simulator.

The working envelope is 900 × 1,200 × 800 mm, using the documented ACCURA 9/12/8 variant. From the front, X increases to the right, Y away from the operator and Z away from the granite. Machine zero is at the lower front-left of the simulated measuring volume, with the bridge saddle near the front of its stepped granite guide. The rear rack uses additional modeled service travel from Y = 1,200 to 1,460 mm. The readout follows the virtual tip datum, and when unloaded it follows the corresponding nominal tip plane. Home parks X and Y at 0 and Z at 800 mm. Geometry and setup were modeled from reference photos. Docking clearances, the covered-socket animation, practice contact and speed are simulation parameters. The simulator adds the two Dynamic Tensor demonstration passes to the master-reference cycle and reports a geometric fit from simulated data. The passes use modeled rates of 8 and 40 mm/s.

The left bridge foot rides across the flat granite. The right saddle wraps around a raised guide and carries the finned side cover and one end of the cable carrier. The carrier keeps a fixed total length as its bend moves along the tray during Y travel.

## References

- [ZEISS BP26SE Control Console Operating Instructions, 61211-5080102](https://qualityforum.zeiss.com/migration/images/164_7f25a8672622a8cf52a1a9a44022dd04.pdf)
- [ZEISS ACCURA specifications and measuring ranges](https://www.basstool.com/pdf/literature/zeiss/EN_Specifications_ACCURA.pdf)
- [igus cable carrier guide for linear travel](https://www.igus.com/cable-carriers/resources/e-chain-designing-calculation)
- [ZEISS Multi Sensor Rack overview](https://asset-downloads.zeiss.com/catalogs/download/iqs/7a9556cb-72be-4ed7-b5ef-da51d3d837e4/ZEISS_MSR_DINA4_V3.pdf.pdf)
- [ZEISS logo file and attribution](https://commons.wikimedia.org/wiki/File:Zeiss_logo.svg)
- [ZEISS contact probing systems, VAST XT gold and magnetic stylus attachment](https://asset-downloads.zeiss.com/catalogs/download/iqs/e969880b-6fb4-47ad-9864-835ac06d2d00/BA_Sensorik_taktil_REV_1_0_en.pdf.pdf)
- [ZEISS VAST/MT socket](https://shop.metrology.zeiss.com/probe-socket-for-vast-mt-zid600660-8365-000) and [compatible VAST XT adapter plate](https://shop.metrology.zeiss.com/INTERSHOP/web/WFS/IMT-US-Site/en_US/-/USD/ViewProduct-Start?SKU=600667-9612-000)
- [ZEISS reference stylus M5 DK8 L63.5](https://shop.metrology.zeiss.com/INTERSHOP/web/WFS/IMT-US-Site/en_US/-/USD/ViewProduct-Start?SKU=600342-8023-010) and [RSH-214 reference kit DK30](https://shop.metrology.zeiss.com/INTERSHOP/web/WFS/IMT-US-Site/en_US/-/USD/ViewProduct-Start?SKU=600332-9265-000)
- [ZEISS sensor cookbook for locating the reference sphere](https://www.zeiss.com/content/dam/Industrial%20Metrology/Campaigns/365_Days_of_Precision/january2018campaign/sensor_cookbook_en.pdf) and [CALYPSO VAST Navigator dynamic stylus qualification](https://qualityforum.zeiss.com/migration/images/4710_f7c595ccd7ba0d015c5d60ad07ae2a48.pdf)
