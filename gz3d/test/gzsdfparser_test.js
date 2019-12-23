describe('Sdf Parser tests', function() {

  const utilsPath = 'http://localhost:9876/base/gz3d/test/utils/';

  var scene;
  var gui;
  var sdfparser;

  beforeAll(function(){
    // Initializing object used in the test.
    scene = new GZ3D.Scene();
    gui = new GZ3D.Gui(scene);
    sdfparser = new GZ3D.SdfParser(scene, gui);
  });

  describe('Initialization', function() {
    it('should be properly initialized', function() {

      expect(sdfparser.emitter).toEqual(globalEmitter);
    });
  });

  describe('Parse color test, string to json', function() {
    it('should return a json color', function() {
      var color = {r: 212, g: 199, b: 0.2, a: 0.9};
      expect(sdfparser.parseColor('212 199 0.2 0.9')).toEqual(color);
      color = {r: 0, g: 300, b: 0.0001, a: -278};
      expect(sdfparser.parseColor('0 300 0.0001 -278')).toEqual(color);
      // Shouldn't equal
      expect(sdfparser.parseColor('0 300 0.0001-278')).not.toEqual(color);
      expect(sdfparser.parseColor('0 300 0.0001')).not.toEqual(color);
      expect(sdfparser.parseColor('0 A 0.0001-278')).not.toEqual(color);
    });
  });

  describe('Parse string size test, string to json', function() {
    it('should return a json', function() {
      var size = {x: 0.092, y: 1, z: 1.1};
      expect(sdfparser.parseSize('0.092 1 1.1')).toEqual(size);
      // Shouldn't equal
      expect(sdfparser.parseSize('0.0 9.2. 11.1')).not.toEqual(size);
      expect(sdfparser.parseSize('11 2121')).not.toEqual(size);
      expect(sdfparser.parseSize('x 21 z')).not.toEqual(size);
    });
  });

  describe('Parse 3DVector test, string to json', function() {
    it('should return a json object', function() {
      var vec = {x: 1.001, y: 3, z: 0.0001};
      expect(sdfparser.parse3DVector('1.001 3 0.0001')).toEqual(vec);
      // Shouldn't equal
      expect(sdfparser.parse3DVector('1.001 3 0.0.0001')).not.toEqual(vec);
      expect(sdfparser.parse3DVector('1 21')).not.toEqual(vec);
      expect(sdfparser.parse3DVector('a 20 c')).not.toEqual(vec);
    });
  });

  describe('Parse scale test, string to Vector3', function() {
    it('should return a vector3 object', function() {
      var vec = new THREE.Vector3(0.1,0.4,0.66);
      expect(sdfparser.parseScale('0.1 0.4 0.66')).toEqual(vec);
      // Shouldn't equal
      expect(sdfparser.parseScale('0..1 0.4 0.66')).not.toEqual(vec);
      expect(sdfparser.parseScale('0.104 0.66')).not.toEqual(vec);
      expect(sdfparser.parseScale('1 2 A')).not.toEqual(vec);
    });
  });

  describe('Spawn a light from SDF', function() {
    it('Should create a THREE.Object3D of type directional light', function() {
      var sdfLight, obj3D;

      sdfLight = '<?xml version="1.0" ?>'+
      '<sdf version="1.5">'+
        '<light type="directional" name="sun">'+
          '<cast_shadows>true</cast_shadows>'+
          '<pose>0 0 10 0 0 0</pose>'+
          '<diffuse>0.8 0.8 0.8 1</diffuse>'+
          '<specular>0.2 0.2 0.2 1</specular>'+
          '<attenuation>'+
            '<range>1000</range>'+
            '<constant>0.9</constant>'+
            '<linear>0.01</linear>'+
            '<quadratic>0.001</quadratic>'+
          '</attenuation>'+
          '<direction>-0.5 0.1 -0.9</direction>'+
        '</light>'+
      '</sdf>';

      var obj = sdfparser.spawnFromSDF(sdfLight);
      lightPosition = {x:0, y:0, z:10};
      lightRotation = {x:0, y:0, z:0};
      expect(obj.position.x).toEqual(lightPosition.x);
      expect(obj.position.y).toEqual(lightPosition.y);
      expect(obj.position.z).toEqual(lightPosition.z);
      rot = obj.rotation.reorder('ZYX');
      expect(rot.x).toBeCloseTo(lightRotation.x, 3);
      expect(rot.y).toBeCloseTo(lightRotation.y, 3);
      expect(rot.z).toBeCloseTo(lightRotation.z, 3);

      // children[0] is the light object and children[1] is the visual
      // representation of the light object
      obj3D = obj.children[0];
      expect(obj3D.color.r).toEqual(0.8);
      expect(obj3D.color.g).toEqual(0.8);
      expect(obj3D.color.b).toEqual(0.8);
      // expect(obj3D.color.a).toEqual(1);
      expect(obj3D.intensity).toBeGreaterThan(0.0);
      expect(obj3D.type).toEqual('DirectionalLight');
      expect(obj3D.name).toEqual('sun');
    });
  });

  describe('Spawn a box from SDF, initialize and verify its pose', function() {
    it('Should spawn in the right pose', function() {
      var pose, rotation, sdf, obj3D, expectedRot;

      position = {x:3, y:1, z:1};
      rotation = {x:0.5, y:1, z:0.2};
      sdf = sdfparser.createBoxSDF(position, rotation);
      obj3D = sdfparser.spawnFromSDF(sdf);
      expect(obj3D.position.x).toEqual(position.x);
      expect(obj3D.position.y).toEqual(position.y);
      expect(obj3D.position.z).toEqual(position.z);
      // Shouldn't equal
      expect(obj3D.position.z).not.toEqual(0.9);
      expectedRot = obj3D.rotation.reorder('ZYX');
      expect(expectedRot.x).toBeCloseTo(rotation.x, 3);
      expect(expectedRot.y).toBeCloseTo(rotation.y, 3);
      expect(expectedRot.z).toBeCloseTo(rotation.z, 3);
    });
  });

  describe('Spawn a world from SDF', function() {
    it('Should create a world THREE.Object3D', function() {
      var sdfWorld, obj3D;

      sdfWorld = '<?xml version="1.0" ?>'+
      '<sdf version="1.6">'+
        '<world name="default">'+
          '<include>'+
            '<name>test_beer</name>'+
            '<pose>-3 -9 -1 0 0 0.2</pose>'+
            '<uri>model://beer</uri>'+
          '</include>'+
          '<model name="box">' +
            '<pose>0 1 0.5 1.2 0 0</pose>' +
            '<link name="link">' +
              '<collision name="collision">' +
                '<geometry>' +
                  '<box>' +
                    '<size>1 1 1</size>' +
                  '</box>' +
                '</geometry>' +
              '</collision>' +
              '<visual name="visual">' +
                '<geometry>' +
                  '<box>' +
                    '<size>1 1 1</size>' +
                  '</box>' +
                '</geometry>' +
              '</visual>' +
            '</link>' +
            '<model name="nested_sphere">' +
              '<pose>2 4 3.5 -0.3 0 0</pose>' +
              '<link name="nested_link">' +
                '<collision name="nested_collision">' +
                  '<geometry>' +
                    '<sphere>' +
                      '<radius>0.5</radius>' +
                    '</sphere>' +
                  '</geometry>' +
                '</collision>' +
                '<visual name="nested_visual">' +
                  '<geometry>' +
                    '<sphere>' +
                      '<radius>0.5</radius>' +
                    '</sphere>' +
                  '</geometry>' +
                '</visual>' +
              '</link>' +
            '</model>' +
          '</model>' +
          '<light type="point" name="test_light">'+
            '<cast_shadows>true</cast_shadows>'+
            '<pose>-3 1 10 0 1 0</pose>'+
            '<diffuse>0.1 0.2 0.8 1</diffuse>'+
            '<specular>0.2 0.0 0.9 1</specular>'+
            '<attenuation>'+
              '<range>8.3</range>'+
              '<constant>0.2</constant>'+
              '<linear>0.001</linear>'+
              '<quadratic>0.002</quadratic>'+
            '</attenuation>'+
          '</light>'+
        '</world' +
      '</sdf>';

      // setup new sdfparser for this test
      worldSdfparser = new GZ3D.SdfParser(scene, gui);
      worldSdfparser.usingFileUrls = true
      worldSdfparser.addUrl(utilsPath + 'beer/model.sdf');

      obj = worldSdfparser.spawnFromSDF(sdfWorld);
      // there should only be two models and one light
      expect(obj.children.length).toEqual(3);

      // verify included mdoel
      var obj3D = obj.children[0];
      expect(obj3D.name).toEqual('test_beer');
      includePosition = {x:-3, y:-9, z:-1};
      includeRotation = {x:0, y:0, z:0.2};
      expect(obj3D.position.x).toEqual(includePosition.x);
      expect(obj3D.position.y).toEqual(includePosition.y);
      expect(obj3D.position.z).toEqual(includePosition.z);
      var rot = obj3D.rotation.reorder('ZYX');
      expect(rot.x).toBeCloseTo(includeRotation.x, 3);
      expect(rot.y).toBeCloseTo(includeRotation.y, 3);
      expect(rot.z).toBeCloseTo(includeRotation.z, 3);

      // verify model
      obj3D = obj.children[1];
      expect(obj3D.name).toEqual('box');
      modelPosition = {x:0, y:1, z:0.5};
      modelRotation = {x:1.2, y:0, z:0};
      expect(obj3D.position.x).toEqual(modelPosition.x);
      expect(obj3D.position.y).toEqual(modelPosition.y);
      expect(obj3D.position.z).toEqual(modelPosition.z);
      rot = obj3D.rotation.reorder('ZYX');
      expect(rot.x).toBeCloseTo(modelRotation.x, 3);
      expect(rot.y).toBeCloseTo(modelRotation.y, 3);
      expect(rot.z).toBeCloseTo(modelRotation.z, 3);

      // verify link
      var linkObj3D = obj3D.children[0];
      expect(linkObj3D.name).toEqual('link');

      // verify visual
      var visualObj3D = linkObj3D.children[0];
      expect(visualObj3D.name).toEqual('visual');
      mesh = visualObj3D.children[0];
      expect(mesh.type).toEqual('Mesh');
      expect(mesh.geometry.type).toEqual('BoxGeometry');
      expect(mesh.geometry.parameters.width).toEqual(1);
      expect(mesh.geometry.parameters.height).toEqual(1);
      expect(mesh.geometry.parameters.depth).toEqual(1);

      // verify collision
      var colObj3D = linkObj3D.children[1];
      expect(colObj3D.name).toEqual('collision');
      var mesh = colObj3D.children[0];
      expect(mesh.type).toEqual('Mesh');
      expect(mesh.geometry.type).toEqual('BoxGeometry');
      expect(mesh.geometry.parameters.width).toEqual(1);
      expect(mesh.geometry.parameters.height).toEqual(1);
      expect(mesh.geometry.parameters.depth).toEqual(1);

      // verify nested model
      nestedObj3D = obj3D.children[1];
      expect(nestedObj3D.name).toEqual('nested_sphere');
      nestedModelPosition = {x:2, y:4, z:3.5};
      nestedModelRotation = {x:-0.3, y:0, z:0};
      expect(nestedObj3D.position.x).toEqual(nestedModelPosition.x);
      expect(nestedObj3D.position.y).toEqual(nestedModelPosition.y);
      expect(nestedObj3D.position.z).toEqual(nestedModelPosition.z);
      rot = nestedObj3D.rotation.reorder('ZYX');
      expect(rot.x).toBeCloseTo(nestedModelRotation.x, 3);
      expect(rot.y).toBeCloseTo(nestedModelRotation.y, 3);
      expect(rot.z).toBeCloseTo(nestedModelRotation.z, 3);

      // verify nested link
      var nestedLinkObj3D = nestedObj3D.children[0];
      expect(nestedLinkObj3D.name).toEqual('nested_link');

      // verify visual
      var nestedVisualObj3D = nestedLinkObj3D.children[0];
      expect(nestedVisualObj3D.name).toEqual('nested_visual');
      mesh = nestedVisualObj3D.children[0];
      expect(mesh.type).toEqual('Mesh');
      expect(mesh.geometry.type).toEqual('SphereGeometry');
      expect(mesh.geometry.parameters.radius).toEqual(0.5);

      // verify collision
      var nestedColObj3D = nestedLinkObj3D.children[1];
      expect(nestedColObj3D.name).toEqual('nested_collision');
      mesh = nestedColObj3D.children[0];
      expect(mesh.type).toEqual('Mesh');
      expect(mesh.geometry.type).toEqual('SphereGeometry');
      expect(mesh.geometry.parameters.radius).toEqual(0.5);

      // verify light
      obj3D = obj.children[2];
      expect(obj3D.name).toEqual('test_light');
      lightPosition = {x:-3, y:1, z:10};
      lightRotation = {x:0, y:1, z:0};
      expect(obj3D.position.x).toEqual(lightPosition.x);
      expect(obj3D.position.y).toEqual(lightPosition.y);
      expect(obj3D.position.z).toEqual(lightPosition.z);
      rot = obj3D.rotation.reorder('ZYX');
      expect(rot.x).toBeCloseTo(lightRotation.x, 3);
      expect(rot.y).toBeCloseTo(lightRotation.y, 3);
      expect(rot.z).toBeCloseTo(lightRotation.z, 3);
      var lightObj = obj3D.children[0];
      expect(lightObj.color.r).toEqual(0.1);
      expect(lightObj.color.g).toEqual(0.2);
      expect(lightObj.color.b).toEqual(0.8);
      expect(lightObj.intensity).toBeGreaterThan(0.0);
      expect(lightObj.type).toEqual('PointLight');
      expect(lightObj.distance).toEqual(8.3);
    });
  });


  describe('Load without URL or file name', function() {
    it('should not break.', function() {

      var obj = sdfparser.loadSDF();
      expect(obj).toEqual(undefined);
    });
  });

  describe('Load inexistent URL', function() {
    it('should not break.', function() {

      var obj = sdfparser.loadSDF('http://banana.sdf');
      expect(obj).toEqual(undefined);
    });
  });

  describe('Add a model to the scene using custom urls', function() {
    it('should add a model to the scene and then remove it', function() {

      // Tell it to use custom URLs
      sdfparser.usingFilesUrls = true;

      // Check there are no custom URLs yet
      expect(sdfparser.customUrls.length).toEqual(0);

      // Try to add invalid URL
      sdfparser.addUrl('banana');
      expect(sdfparser.customUrls.length).toEqual(0);

      // Add valid URL
      sdfparser.addUrl(utilsPath + 'house_2/meshes/house_2.dae');
      expect(sdfparser.customUrls.length).toEqual(1);

      // Load SDF
      var obj = sdfparser.loadSDF(utilsPath + 'house_2/model.sdf');

      expect(obj).not.toEqual(undefined);
      expect(obj.children.length).toEqual(1);
      expect(obj.children[0].name).toEqual('link');
      expect(obj.children[0].children.length).toEqual(2);
      expect(obj.children[0].children[0].name).toEqual('visual');
      expect(obj.children[0].children[1].name).toEqual('collision');

      // Add to scene
      scene.add(obj);

      model = scene.getByName('House 2');
      expect(model).not.toEqual(undefined);

      // Remove from scene
      scene.remove(model);

      model = scene.getByName('House 2');
      expect(model).toEqual(undefined);
    });
  });

  describe('Material event', function() {
    it('should concatenate several materials', function() {

      // Starts empty
      expect(sdfparser.materials).toBeDefined();
      expect(sdfparser.materials).toEqual({});

      // Add material
      sdfparser.emitter.emit('material', {'Material1': {}});
      expect(sdfparser.materials['Material1']).toBeDefined();

      // Add another material
      sdfparser.emitter.emit('material', {'Material2': {}});
      expect(sdfparser.materials['Material1']).toBeDefined();
      expect(sdfparser.materials['Material2']).toBeDefined();

      // Add multiple materials
      sdfparser.emitter.emit('material', {'Material3': {}, 'Material4': {}});
      expect(sdfparser.materials['Material1']).toBeDefined();
      expect(sdfparser.materials['Material2']).toBeDefined();
      expect(sdfparser.materials['Material3']).toBeDefined();
      expect(sdfparser.materials['Material4']).toBeDefined();
    });
  });

  // TODO: test sdfParser.createMaterial
  // have to be able to load the materials with no gzserver
  // or an another solution

});
