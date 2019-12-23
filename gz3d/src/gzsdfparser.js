/**
 * SDF parser constructor initializes SDF parser with the given parameters
 * and defines a DOM parser function to parse SDF XML files
 * @param {object} scene - the gz3d scene object
 * @param {object} gui - the gz3d gui object
 * @param {object} gziface [optional] - the gz3d gziface object, if not gziface
 * object was provided, sdfParser wont try to connect to gzserver.
 **/
GZ3D.SdfParser = function(scene, gui, gziface)
{
  this.emitter = globalEmitter || new EventEmitter2({verboseMemoryLeak: true});

  // set the sdf version
  this.SDF_VERSION = 1.5;
  this.MATERIAL_ROOT = gziface ?
      gziface.protocol + '//' + gziface.url + '/assets' : 'assets';
  // true for using URLs to load files.
  // false for using the files loaded in the memory.
  this.usingFilesUrls = false;

  // set the xml parser function
  this.parseXML = function(xmlStr) {
    return (new window.DOMParser()).parseFromString(xmlStr, 'text/xml');
  };

  this.scene = scene;
  this.scene.setSDFParser(this);
  this.gui = gui;
  this.gziface = gziface;
  this.init();

  // cache materials if more than one model needs them
  this.materials = {};
  this.entityMaterial = {};
  // store meshes when loading meshes from memory.
  this.meshes = {};
  this.mtls = {};
  this.textures = {};

  // Should contain model files URLs if not using gzweb model files hierarchy.
  this.customUrls = [];

  var that = this;
  this.emitter.on('material', function(mat) {
    that.materials = Object.assign(that.materials, mat);
  });
};

/**
 * Initializes SDF parser by connecting relevant events from gziface,
 * if gziface was not provided, just initialize the scene and don't listen
 * on gziface events.
 */
GZ3D.SdfParser.prototype.init = function()
{
  if (this.gziface)
  {
    this.usingFilesUrls = true;
    var that = this;
    this.emitter.on('connectionError', function() {
      // init scene and show popup only for the first connection error
      that.emitter.emit('notification_popup',
              'GzWeb is currently running' +
              'without a server, and materials could not be loaded.' +
              'When connected scene will be reinitialized', 5000);
      that.onConnectionError();
    });

    this.emitter.on('gzstatus', function(gzstatus) {
      if (gzstatus === 'error')
      {
        that.emitter.emit('notification_popup', 'GzWeb is currently ' +
                'running without a GzServer,'
                + 'and Scene is reinitialized.', 5000);
        that.onConnectionError();
      }
    });
  }
  else
  {
    this.scene.initScene();
  }
};

/**
 * Pushes Urls into the customUrls array where the parser looks for assets.
 * If `usingFilesUrls` is true, resources will only be taken from this array.
 * TODO: Find a less intrusive way to support custom URLs (issue #147)
 */
GZ3D.SdfParser.prototype.addUrl = function(url)
{
  if (url === undefined || url.indexOf('http') !== 0)
  {
    console.log('Trying to add invalid URL');
    return;
  }

  this.customUrls.push(url);
};

/**
 * Event callback function for gziface connection error which occurs
 * when gziface cannot connect to gzbridge websocket
 * this is due to 2 reasons:
 * 1 - gzbridge websocket might not be run yet
 * 2 - gzbridge websocket is trying to connect to
 *       gzserver which is not running currenly
 */
GZ3D.SdfParser.prototype.onConnectionError = function()
{
  this.scene.initScene();

  var that = this;
  var entityCreated = function(model, type)
  {
    if (!that.gziface.isConnected)
    {
      that.addModelByType(model, type);
    }
  };
  this.emitter.on('entityCreated', entityCreated);

  var deleteEntity = function(entity)
  {
    var name = entity.name;
    var obj = that.scene.getByName(name);
    if (obj !== undefined)
    {
      if (obj.children[0] instanceof THREE.Light)
      {
        that.emitter.emit('setLightStats', {name: name}, 'delete');
      }
      else
      {
        that.gui.setModelStats({name: name}, 'delete');
      }
      that.scene.remove(obj);
    }
  };
  this.emitter.on('deleteEntity', deleteEntity);
};

/**
 * Parses string which denotes the color
 * @param {string} colorStr - string which denotes the color where every value
 * should be separated with single white space
 * @returns {object} color - color object having r,g,b and alpha values
 */
GZ3D.SdfParser.prototype.parseColor = function(colorStr)
{
  var color = {};
  var values = colorStr.split(/\s+/);

  color.r = parseFloat(values[0]);
  color.g = parseFloat(values[1]);
  color.b = parseFloat(values[2]);
  color.a = parseFloat(values[3]);

  return color;
};

/**
 * Parses string which is a 3D vector
 * @param {string} vectorStr - string which denotes the vector where every value
 * should be separated with single white space
 * @returns {object} vector3D - vector having x, y, z values
 */
GZ3D.SdfParser.prototype.parse3DVector = function(vectorStr)
{
  var vector3D = {};
  var values = vectorStr.split(/\s+/);
  vector3D.x = parseFloat(values[0]);
  vector3D.y = parseFloat(values[1]);
  vector3D.z = parseFloat(values[2]);
  return vector3D;
};

/**
 * Creates THREE light object according to properties of sdf object
 * which is parsed from sdf model of the light
 * @param {object} sdfObj - object which is parsed from the sdf string
 * @returns {THREE.Light} lightObj - THREE light object created
 * according to given properties. The type of light object is determined
 * according to light type
 */
GZ3D.SdfParser.prototype.spawnLightFromSDF = function(sdfObj)
{
  var light = sdfObj.light;
  var name = light['@name'];
  var diffuse = this.parseColor(light.diffuse);
  var specular = this.parseColor(light.specular);
  var pose = this.parsePose(light.pose);
  var castShadows = this.parseBool(light.cast_shadows);
  var distance = null;
  var attConst = null;
  var attLin = null;
  var attQuad= null;
  var direction = null;
  var type = 1;

  if (light.attenuation)
  {
    if (light.attenuation.range)
    {
      distance = parseFloat(light.attenuation.range);
    }
    if (light.attenuation.constant)
    {
      attConst = parseFloat(light.attenuation.constant);
    }
    if (light.attenuation.linear)
    {
      attLin = parseFloat(light.attenuation.linear);
    }
    if (light.attenuation.quadratic)
    {
      attQuad = parseFloat(light.attenuation.quadratic);
    }
  }
  // equation taken from
  // eslint-disable-next-line
  // https://docs.blender.org/manual/en/dev/render/blender_render/lighting/lights/light_attenuation.html
  var E = 1;
  var D = 1;
  var r = 1;
  var L = attLin;
  var Q = attQuad;
  var intensity = E*(D/(D+L*r))*(Math.pow(D,2)/(Math.pow(D,2)+Q*Math.pow(r,2)));

  if (light['@type'] === 'point')
  {
    type = 1;
  }
  if (light['@type'] === 'spot')
  {
    type = 2;
  }
  else if (light['@type'] === 'directional')
  {
    type = 3;
    direction = this.parse3DVector(light.direction);
  }
  var lightObj = this.scene.createLight(type, diffuse, intensity, pose,
      distance, castShadows, name, direction, specular,
      attConst, attLin, attQuad);

  return lightObj;
};

/**
 * Parses a string which is a 3D vector
 * @param {string} poseStr - string which denotes the pose of the object
 * where every value should be separated with single white space and
 * first three denotes x,y,z and values of the pose,
 * and following three denotes euler rotation around x,y,z
 * @returns {object} pose - pose object having position (x,y,z)(THREE.Vector3)
 * and orientation (THREE.Quaternion) properties
 */
GZ3D.SdfParser.prototype.parsePose = function(poseStr)
{
  var pose = {
    'position': new THREE.Vector3(),
    'orientation': new THREE.Quaternion()
  };

  if (typeof poseStr !== 'string' && !(poseStr instanceof String))
  {
    return pose;
  }

  var values = poseStr.split(/\s+/);

  var position = new THREE.Vector3(parseFloat(values[0]),
          parseFloat(values[1]), parseFloat(values[2]));

  // get euler rotation and convert it to Quaternion
  var quaternion = new THREE.Quaternion();
  var euler = new THREE.Euler(parseFloat(values[3]), parseFloat(values[4]),
          parseFloat(values[5]), 'ZYX');
  quaternion.setFromEuler(euler);

  pose.position =  position;
  pose.orientation = quaternion;

  return pose;
};

/**
 * Parses a string which is a 3D vector
 * @param {string} scaleStr - string which denotes scaling in x,y,z
 * where every value should be separated with single white space
 * @returns {THREE.Vector3} scale - THREE Vector3 object
 * which denotes scaling of an object in x,y,z
 */
GZ3D.SdfParser.prototype.parseScale = function(scaleStr)
{
  var values = scaleStr.split(/\s+/);
  var scale = new THREE.Vector3(parseFloat(values[0]), parseFloat(values[1]),
          parseFloat(values[2]));
  return scale;
};

/**
 * Parses a string which is a boolean
 * @param {string} boolStr - string which denotes a boolean value
 * where the values can be true, false, 1, or 0.
 * @returns {bool} bool - bool value
 */
GZ3D.SdfParser.prototype.parseBool = function(boolStr)
{
  return JSON.parse(boolStr);
};

/**
 * Parses SDF material element which is going to be used by THREE library
 * It matches material scripts with the material objects which are
 * already parsed by gzbridge and saved by SDFParser.
 * If `usingFilesUrls` is true, the texture URLs will be loaded from the
 * to the customUrls array.
 * @param {object} material - SDF material object
 * @returns {object} material - material object which has the followings:
 * texture, normalMap, ambient, diffuse, specular, opacity
 */
GZ3D.SdfParser.prototype.createMaterial = function(material)
{
  var textureUri, texture, mat;
  var ambient, diffuse, specular, opacity, normalMap, scale;

  if (!material)
  {
    return null;
  }

  var script = material.script;
  if (script)
  {
    // if there is just one uri convert it to array
    if (!script.uri)
    {
      script.uri = ['file://media/materials/scripts/gazebo.material'];
    }

    if (!(script.uri instanceof Array))
    {
      script.uri = [script.uri];
    }

    if (script.name)
    {
      mat = this.materials[script.name];
      // if we already cached the materials
      if (mat)
      {
        ambient = mat.ambient;
        diffuse = mat.diffuse;
        specular = mat.specular;
        opacity = mat.opacity;
        scale = mat.scale;

        if (mat.texture)
        {
          for (var i = 0; i < script.uri.length; ++i)
          {
            var uriType = script.uri[i].substring(0, script.uri[i]
                    .indexOf('://'));
            if (uriType === 'model')
            {
              // if texture uri
              if (script.uri[i].indexOf('textures') > 0)
              {
                textureUri = script.uri[i].substring(script.uri[i]
                        .indexOf('://') + 3);
                break;
              }
            }
            else if (uriType === 'file')
            {
              if (script.uri[i].indexOf('materials') > 0)
              {
                textureUri = script.uri[i].substring(script.uri[i]
                        .indexOf('://') + 3, script.uri[i]
                        .indexOf('materials') + 9)
                        + '/textures';
                break;
              }
            }
          }
          // Map texture name to the corresponding texture.
          if (!this.usingFilesUrls)
          {
            texture = this.textures[mat.texture];
          }
          else
          {
            if (this.customUrls.length !== 0)
            {
              for (var k = 0; k < this.customUrls.length; k++)
              {
                if (this.customUrls[k].indexOf(mat.texture) > -1)
                {
                  texture = this.customUrls[k];
                  break;
                }
              }
            }
            else
            {
              texture = this.MATERIAL_ROOT + '/' + textureUri + '/' +
                mat.texture;
            }
          }
        }
      }
      else
      {
        //TODO: how to handle if material is not cached
        console.log(script.name + ' is not cached!!!');
      }
    }
  }

  // normal map
  if (material.normal_map)
  {
    var mapUri;
    if (material.normal_map.indexOf('://') > 0)
    {
      mapUri = material.normal_map.substring(
              material.normal_map.indexOf('://') + 3, material.normal_map
                      .lastIndexOf('/'));
    }
    else
    {
      mapUri = textureUri;
    }
    if (mapUri)
    {
      var startIndex = material.normal_map.lastIndexOf('/') + 1;
      if (startIndex < 0)
      {
        startIndex = 0;
      }
      var normalMapName = material.normal_map.substr(startIndex,
        material.normal_map.lastIndexOf('.') - startIndex);
      // Map texture name to the corresponding texture.
      if (!this.usingFilesUrls)
      {
        normalMap = this.textures[normalMapName + '.png'];
      }
      else
      {
        if (this.customUrls.length !== 0)
        {
          for (var j = 0; j < this.customUrls.length; j++)
          {
            if (this.customUrls[j].indexOf(normalMapName + '.png') > -1)
            {
              normalMap = this.customUrls[j];
              break;
            }
          }
        }
        else
        {
          normalMap = this.MATERIAL_ROOT + '/' + mapUri + '/' +
            normalMapName + '.png';
        }
      }

    }
  }

  return {
    texture: texture,
    normalMap: normalMap,
    ambient: ambient,
    diffuse: diffuse,
    specular: specular,
    opacity: opacity,
    scale: scale
  };

};

/**
 * Parses a string which is a size of an object
 * @param {string} sizeStr - string which denotes size in x,y,z
 * where every value should be separated with single white space
 * @returns {object} size - size object which denotes
 * size of an object in x,y,z
 */
GZ3D.SdfParser.prototype.parseSize = function(sizeStr)
{
  var sizeObj;
  var values = sizeStr.split(/\s+/);
  var x = parseFloat(values[0]);
  var y = parseFloat(values[1]);
  var z = parseFloat(values[2]);
  sizeObj = {
    'x': x,
    'y': y,
    'z': z
  };

  return sizeObj;
};

/**
 * Parses SDF geometry element and creates corresponding mesh,
 * when it creates the THREE.Mesh object it directly add it to the parent
 * object.
 * @param {object} geom - SDF geometry object which determines the geometry
 *  of the object and can have following properties: box, cylinder, sphere,
 *  plane, mesh.
 *  Note that in case of using custom Urls for the meshs, the URLS should be
 *  added to the array cistomUrls to be used instead of the default Url.
 * @param {object} mat - SDF material object which is going to be parsed
 * by createMaterial function
 * @param {object} parent - parent 3D object
 */
GZ3D.SdfParser.prototype.createGeom = function(geom, mat, parent)
{
  var that = this;
  var obj;
  var size, normal;

  var material = this.createMaterial(mat);

  if (geom.box)
  {
    size = this.parseSize(geom.box.size);
    obj = this.scene.createBox(size.x, size.y, size.z);
  }
  else if (geom.cylinder)
  {
    var radius = parseFloat(geom.cylinder.radius);
    var length = parseFloat(geom.cylinder.length);
    obj = this.scene.createCylinder(radius, length);
  }
  else if (geom.sphere)
  {
    obj = this.scene.createSphere(parseFloat(geom.sphere.radius));
  }
  else if (geom.plane)
  {
    normal = this.parseSize(geom.plane.normal);
    size = this.parseSize(geom.plane.size);
    obj = this.scene.createPlane(normal.x, normal.y, normal.z, size.x, size.y);
  }
  else if (geom.mesh)
  {
    var meshUri = geom.mesh.uri;
    var submesh;
    var centerSubmesh;


    if (geom.mesh.submesh)
    {
      submesh = geom.mesh.submesh.name;
      centerSubmesh = this.parseBool(geom.mesh.submesh.center);
    }

    var uriType = meshUri.substring(0, meshUri.indexOf('://'));
    if (uriType === 'file' || uriType === 'model')
    {
      var modelName = meshUri.substring(meshUri.indexOf('://') + 3);
      if (geom.mesh.scale)
      {
        var scale = this.parseScale(geom.mesh.scale);
        parent.scale.x = scale.x;
        parent.scale.y = scale.y;
        parent.scale.z = scale.z;
      }

      var modelUri = this.MATERIAL_ROOT + '/' + modelName;
      var ext = modelUri.substr(-4).toLowerCase();
      var materialName = parent.name + '::' + modelUri;
      this.entityMaterial[materialName] = material;
      var meshFileName = meshUri.substring(meshUri.lastIndexOf('/') + 1);

      if (!this.usingFilesUrls)
      {
        var meshFile = this.meshes[meshFileName];
        if (!meshFile)
        {
          console.error('Missing mesh file [' + meshFileName + ']');
          return;
        }

        if (ext === '.obj')
        {
          var mtlFileName = meshFileName.split('.')[0]+'.mtl';
          var mtlFile = this.mtls[mtlFileName];
          if (!mtlFile)
          {
            console.error('Missing MTL file [' + mtlFileName + ']');
            return;
          }

          that.scene.loadMeshFromString(modelUri, submesh, centerSubmesh,
            function(obj)
            {
              if (!obj)
              {
                console.error('Failed to load mesh.');
                return;
              }

              parent.add(obj);
              loadGeom(parent);
            }, [meshFile, mtlFile]);
        }
        else if (ext === '.dae')
        {
          that.scene.loadMeshFromString(modelUri, submesh, centerSubmesh,
            function(dae)
            {
              if (!dae)
              {
                console.error('Failed to load mesh.');
                return;
              }

              if (material)
              {
                var allChildren = [];
                dae.getDescendants(allChildren);
                for (var c = 0; c < allChildren.length; ++c)
                {
                  if (allChildren[c] instanceof THREE.Mesh)
                  {
                    that.scene.setMaterial(allChildren[c], material);
                    break;
                  }
                }
              }
              parent.add(dae);
              loadGeom(parent);
            }, [meshFile]);
        }
      }
      else
      {
        if (this.customUrls.length !== 0)
        {
          for (var k = 0; k < this.customUrls.length; k++)
          {
            if (this.customUrls[k].indexOf(meshFileName) > -1)
            {
              modelUri = this.customUrls[k];
              break;
            }
          }
        }
        this.scene.loadMeshFromUri(modelUri, submesh, centerSubmesh,
          function (mesh)
          {
            if (!mesh)
            {
              console.error('Failed to load mesh.');
              return;
            }

            if (material)
            {
              // Because the stl mesh doesn't have any children we cannot set
              // the materials like other mesh types.
              if (ext !== '.stl')
              {
                var allChildren = [];
                mesh.getDescendants(allChildren);
                for (var c = 0; c < allChildren.length; ++c)
                {
                  if (allChildren[c] instanceof THREE.Mesh)
                  {
                    that.scene.setMaterial(allChildren[c], material);
                    break;
                  }
                }
              }
              else
              {
                that.scene.setMaterial(mesh, material);
              }
            }
            else
            {
              if (ext === '.stl')
              {
                that.scene.setMaterial(mesh, {'ambient': [1,1,1,1]});
              }
            }
          parent.add(mesh);
          loadGeom(parent);
        });
      }
    }
  }
  //TODO: how to handle height map without connecting to the server
  //  else if (geom.heightmap)
  //  {
  //    var request = new ROSLIB.ServiceRequest({
  //      name : that.scene.name
  //    });
  //
  //    // redirect the texture paths to the assets dir
  //    var textures = geom.heightmap.texture;
  //    for ( var k = 0; k < textures.length; ++k)
  //    {
  //      textures[k].diffuse = this.parseUri(textures[k].diffuse);
  //      textures[k].normal = this.parseUri(textures[k].normal);
  //    }
  //
  //    var sizes = geom.heightmap.size;
  //
  //    // send service request and load heightmap on response
  //    this.heightmapDataService.callService(request,
  //        function(result)
  //        {
  //          var heightmap = result.heightmap;
  //          // gazebo heightmap is always square shaped,
  //          // and a dimension of: 2^N + 1
  //          that.scene.loadHeightmap(heightmap.heights, heightmap.size.x,
  //              heightmap.size.y, heightmap.width, heightmap.height,
  //              heightmap.origin, textures,
  //              geom.heightmap.blend, parent);
  //            //console.log('Result for service call on ' + result);
  //        });
  //
  //    //this.scene.loadHeightmap(parent)
  //  }

  if (obj)
  {
    if (material)
    {
      // texture mapping for simple shapes and planes only,
      // not used by mesh and terrain
      this.scene.setMaterial(obj, material);
    }
    obj.updateMatrix();
    parent.add(obj);
    loadGeom(parent);
  }

  function loadGeom(visualObj)
  {
    var allChildren = [];
    visualObj.getDescendants(allChildren);
    for (var c = 0; c < allChildren.length; ++c)
    {
      if (allChildren[c] instanceof THREE.Mesh)
      {
        allChildren[c].castShadow = true;
        allChildren[c].receiveShadow = true;

        if (visualObj.castShadows)
        {
          allChildren[c].castShadow = visualObj.castShadows;
        }
        if (visualObj.receiveShadows)
        {
          allChildren[c].receiveShadow = visualObj.receiveShadows;
        }

        if (visualObj.name.indexOf('COLLISION_VISUAL') >= 0)
        {
          allChildren[c].castShadow = false;
          allChildren[c].receiveShadow = false;

          allChildren[c].visible = this.scene.showCollisions;
        }
        break;
      }
    }
  }
};

/**
 * Parses SDF visual element and creates THREE 3D object by parsing
 * geometry element using createGeom function
 * @param {object} visual - SDF visual element
 * @returns {THREE.Object3D} visualObj - 3D object which is created
 * according to SDF visual element.
 */
GZ3D.SdfParser.prototype.createVisual = function(visual)
{
  //TODO: handle these node values
  // cast_shadow, receive_shadows
  if (visual.geometry)
  {
    var visualObj = new THREE.Object3D();
    visualObj.name = visual['@name'];

    if (visual.pose)
    {
      var visualPose = this.parsePose(visual.pose);
      this.scene
        .setPose(visualObj, visualPose.position, visualPose.orientation);
    }

    this.createGeom(visual.geometry, visual.material, visualObj);

    return visualObj;
  }

  return null;

};

/**
 * Parses SDF XML string or SDF XML DOM object
 * @param {object} sdf - It is either SDF XML string or SDF XML DOM object
 * @returns {THREE.Object3D} object - 3D object which is created from the
 * given SDF.
 */
GZ3D.SdfParser.prototype.spawnFromSDF = function(sdf)
{
  // Parse sdfXML
  var sdfXML;
  if ((typeof sdf) === 'string')
  {
    sdfXML = this.parseXML(sdf);
  }
  else
  {
    sdfXML = sdf;
  }

  // Convert SDF XML to Json string and parse JSON string to object
  // TODO: we need better xml 2 json object convertor
  var sdfJson = xml2json(sdfXML, '\t');
  var sdfObj = JSON.parse(sdfJson).sdf;
  // it is easier to manipulate json object

  if (!sdfObj) {
    console.error('Failed to parse SDF: ', sdfJson);
    return;
  }

  if (sdfObj.model)
  {
    return this.spawnModelFromSDF(sdfObj);
  }
  else if (sdfObj.light)
  {
    return this.spawnLightFromSDF(sdfObj);
  }
  else if (sdfObj.world)
  {
    return this.spawnWorldFromSDF(sdfObj);
  }
};

/**
 * Loads SDF file according to given name.
 * @param {string} sdfName - ether name of model / world or the filename
 * @returns {THREE.Object3D} sdfObject - 3D object which is created
 * according to SDF.
 */
GZ3D.SdfParser.prototype.loadSDF = function(sdfName)
{
  if (!sdfName)
  {
    var m = 'Must provide either a model/world name or the URL of an SDF file';
    console.error(m);
    return;
  }
  var lowerCaseName = sdfName.toLowerCase();
  var filename = null;

  // In case it is a full URL
  if (lowerCaseName.indexOf('http') === 0)
  {
    filename = sdfName;
  }
  // In case it is just the model/world name, look for it on the default URL
  else
  {
    if (lowerCaseName.endsWith('.world') || lowerCaseName.endsWith('.sdf'))
    {
      filename = this.MATERIAL_ROOT + '/worlds/' + sdfName;
    }
    else
    {
      filename = this.MATERIAL_ROOT + '/' + sdfName + '/model.sdf';
    }
  }

  if (!filename)
  {
    console.log('Error: unable to load ' + sdfName + ' - file not found');
    return;
  }

  var sdf = this.fileFromUrl(filename);
  if (!sdf) {
    return;
  }
  return this.spawnFromSDF(sdf);
};

/**
 * Creates 3D object from parsed model SDF
 * @param {object} sdfObj - parsed SDF object
 * @returns {THREE.Object3D} modelObject - 3D object which is created
 * according to SDF model object.
 */
GZ3D.SdfParser.prototype.spawnModelFromSDF = function(sdfObj)
{
  // create the model
  var modelObj = new THREE.Object3D();
  modelObj.name = sdfObj.model['@name'];
  //TODO: is that needed
  //modelObj.userData = sdfObj.model.@id;

  var pose;
  var i, j, k;
  var visualObj;
  var linkObj, linkPose;

  if (sdfObj.model.pose)
  {
    pose = this.parsePose(sdfObj.model.pose);
    this.scene.setPose(modelObj, pose.position, pose.orientation);
  }

  //convert link object to link array
  if (!(sdfObj.model.link instanceof Array))
  {
    sdfObj.model.link = [sdfObj.model.link];
  }

  for (i = 0; i < sdfObj.model.link.length; ++i)
  {
    linkObj = this.createLink(sdfObj.model.link[i]);
    if (linkObj)
    {
      modelObj.add(linkObj);
    }
  }

  //convert nested model objects to model array
  if (sdfObj.model.model)
  {
    if (!(sdfObj.model.model instanceof Array))
    {
      sdfObj.model.model = [sdfObj.model.model];
    }
    for (i = 0; i < sdfObj.model.model.length; ++i)
    {
      var tmpModelObj = {model:sdfObj.model.model[i]};
      var nestedModelObj = this.spawnModelFromSDF(tmpModelObj);
      if (nestedModelObj)
      {
        modelObj.add(nestedModelObj);
      }
    }
  }

  return modelObj;
};

/**
 * Creates 3D object from parsed world SDF
 * @param {object} sdfObj - parsed SDF object
 * @returns {THREE.Object3D} worldObject - 3D object which is created
 * according to SDF world object.
 */
GZ3D.SdfParser.prototype.spawnWorldFromSDF = function(sdfObj)
{
  var worldObj = new THREE.Object3D();

  // remove default sun before adding objects
  // we will let the world file create its own light
  var sun = this.scene.getByName('sun');
  if (sun)
  {
    this.scene.remove(sun);
  }

  // parse includes
  if (sdfObj.world.include)
  {
    // convert object to array
    if (!(sdfObj.world.include instanceof Array))
    {
      sdfObj.world.include = [sdfObj.world.include];
    }

    var modelPrefix = 'model://';
    var urlPrefix = 'http';
    for (var i = 0; i < sdfObj.world.include.length; ++i)
    {
      var incObj = sdfObj.world.include[i];
      if (incObj.uri && incObj.uri.startsWith(modelPrefix))
      {
        var modelName = incObj.uri.substr(modelPrefix.length);
        for (var u = 0; u < this.customUrls.length; ++u)
        {
          var urlObj = new URL(this.customUrls[u]);
          if (urlObj.pathname.indexOf(modelName) > 0 &&
              urlObj.pathname.toLowerCase().endsWith('.sdf'))
          {
            var incSDF = this.fileFromUrl(this.customUrls[u]);
            if (!incSDF)
            {
              console.log('Failed to spawn model: ' + modelName);
            }
            else
            {
              var obj = this.spawnFromSDF(incSDF);
              if (incObj.name)
              {
                obj.name = incObj.name;
              }
              if (incObj.pose)
              {
                var pose = this.parsePose(incObj.pose);
                this.scene.setPose(obj, pose.position, pose.orientation);
              }
              worldObj.add(obj);
            }
            break;
          }
        }
      }
    }
  }

  // parse models
  if (sdfObj.world.model)
  {
    // convert object to array
    if (!(sdfObj.world.model instanceof Array))
    {
      sdfObj.world.model = [sdfObj.world.model];
    }

    for (var j = 0; j < sdfObj.world.model.length; ++j)
    {
      var tmpModelObj = {model: sdfObj.world.model[j]};
      var modelObj = this.spawnModelFromSDF(tmpModelObj);
      worldObj.add(modelObj);
    }
  }

  // parse lights
  if (sdfObj.world.light)
  {
    // convert object to array
    if (!(sdfObj.world.light instanceof Array))
    {
      sdfObj.world.light = [sdfObj.world.light];
    }

    for (var k = 0; k < sdfObj.world.light.length; ++k)
    {
      var tmpLightObj = {light: sdfObj.world.light[k]};
      var lightObj = this.spawnLightFromSDF(tmpLightObj);
      worldObj.add(lightObj);
    }
  }

  return worldObj;
};


/**
 * Creates a link 3D object of the model. A model consists of links
 * these links are 3D objects. The function creates only visual elements
 * of the link by createLink function
 * @param {object} link - parsed SDF link object
 * @returns {THREE.Object3D} linkObject - 3D link object
 */
GZ3D.SdfParser.prototype.createLink = function(link)
{
  var linkPose, visualObj;
  var linkObj = new THREE.Object3D();
  linkObj.name = link['@name'];

  if (link.inertial)
  {
    var inertialPose, inertialMass, inertia = {};
    linkObj.userData.inertial = {};
    inertialPose = link.inertial.pose;
    inertialMass = link.inertial.mass;
    inertia.ixx = link.inertial.ixx;
    inertia.ixy = link.inertial.ixy;
    inertia.ixz = link.inertial.ixz;
    inertia.iyy = link.inertial.iyy;
    inertia.iyz = link.inertial.iyz;
    inertia.izz = link.inertial.izz;
    linkObj.userData.inertial.inertia = inertia;
    if (inertialMass)
    {
      linkObj.userData.inertial.mass = inertialMass;
    }
    if (inertialPose)
    {
      linkObj.userData.inertial.pose = inertialPose;
    }
  }

  if (link.pose)
  {
    linkPose = this.parsePose(link.pose);
    this.scene.setPose(linkObj, linkPose.position, linkPose.orientation);
  }

  if (link.visual)
  {
    if (!(link.visual instanceof Array))
    {
      link.visual = [link.visual];
    }

    for (var i = 0; i < link.visual.length; ++i)
    {
      visualObj = this.createVisual(link.visual[i]);
      if (visualObj && !visualObj.parent)
      {
        linkObj.add(visualObj);
      }
    }
  }

  if (link.collision)
  {
    if (!(link.collision instanceof Array))
    {
      link.collision = [link.collision];
    }

    for (var j = 0; j < link.collision.length; ++j)
    {
      visualObj = this.createVisual(link.collision[j]);
      if (visualObj && !visualObj.parent)
      {
        visualObj.castShadow = false;
        visualObj.receiveShadow = false;
        visualObj.visible = this.scene.showCollisions;
        linkObj.add(visualObj);
      }
    }
  }

  return linkObj;
};

/**
 * Creates 3D object according to model name and type of the model and add
 * the created object to the scene.
 * @param {THREE.Object3D} model - model object which will be added to scene
 * @param {string} type - type of the model which can be followings: box,
 * sphere, cylinder, spotlight, directionallight, pointlight
 */
GZ3D.SdfParser.prototype.addModelByType = function(model, type)
{
  var sdf, translation, euler;
  var quaternion = new THREE.Quaternion();
  var modelObj;

  if (model.matrixWorld)
  {
    var matrix = model.matrixWorld;
    translation = new THREE.Vector3();
    euler = new THREE.Euler();
    var scale = new THREE.Vector3();
    matrix.decompose(translation, euler, scale);
    quaternion.setFromEuler(euler);
  }

  if (type === 'box')
  {
    sdf = this.createBoxSDF(translation, euler);
    modelObj = this.spawnFromSDF(sdf);
  }
  else if (type === 'sphere')
  {
    sdf = this.createSphereSDF(translation, euler);
    modelObj = this.spawnFromSDF(sdf);
  }
  else if (type === 'cylinder')
  {
    sdf = this.createCylinderSDF(translation, euler);
    modelObj = this.spawnFromSDF(sdf);
  }
  else if (type === 'spotlight')
  {
    modelObj = this.scene.createLight(2);
    this.scene.setPose(modelObj, translation, quaternion);
  }
  else if (type === 'directionallight')
  {
    modelObj = this.scene.createLight(3);
    this.scene.setPose(modelObj, translation, quaternion);
  }
  else if (type === 'pointlight')
  {
    modelObj = this.scene.createLight(1);
    this.scene.setPose(modelObj, translation, quaternion);
  }
  else
  {
    var sdfObj = this.loadSDF(type);
    modelObj = new THREE.Object3D();
    modelObj.add(sdfObj);
    modelObj.name = model.name;
    this.scene.setPose(modelObj, translation, quaternion);
  }

  var that = this;

  var addModelFunc;
  addModelFunc = function()
  {
    // check whether object is removed
    var obj = that.scene.getByName(modelObj.name);
    if (obj === undefined)
    {
      that.scene.add(modelObj);
      that.gui.setModelStats(modelObj, 'update');
    }
    else
    {
      setTimeout(addModelFunc, 100);
    }
  };

  setTimeout(addModelFunc , 100);

//  this.scene.add(modelObj);
//  this.gui.setModelStats(modelObj, 'update');
};

/**
 * Creates SDF string for simple shapes: box, cylinder, sphere.
 * @param {string} type - type of the model which can be followings: box,
 * sphere, cylinder
 * @param {THREE.Vector3} translation - denotes the x,y,z position
 * of the object
 * @param {THREE.Euler} euler - denotes the euler rotation of the object
 * @param {string} geomSDF - geometry element string of 3D object which is
 * already created according to type of the object
 * @returns {string} sdf - SDF string of the simple shape
 */
GZ3D.SdfParser.prototype.createSimpleShapeSDF = function(type, translation,
        euler, geomSDF)
  {
  var sdf;

  sdf = '<sdf version="' + this.SDF_VERSION + '">' + '<model name="' + type
          + '">' + '<pose>' + translation.x + ' ' + translation.y + ' '
          + translation.z + ' ' + euler.x + ' ' + euler.y + ' ' + euler.z
          + '</pose>' + '<link name="link">'
          + '<inertial><mass>1.0</mass></inertial>'
          + '<collision name="collision">' + '<geometry>' + geomSDF
          + '</geometry>' + '</collision>' + '<visual name="visual">'
          + '<geometry>' + geomSDF + '</geometry>' + '<material>' + '<script>'
          + '<uri>file://media/materials/scripts/gazebo.material' + '</uri>'
          + '<name>Gazebo/Grey</name>' + '</script>' + '</material>'
          + '</visual>' + '</link>' + '</model>' + '</sdf>';

  return sdf;
};

/**
 * Creates SDF string of box geometry element
 * @param {THREE.Vector3} translation - the x,y,z position of
 * the box object
 * @param {THREE.Euler} euler - the euler rotation of the box object
 * @returns {string} geomSDF - geometry SDF string of the box
 */
GZ3D.SdfParser.prototype.createBoxSDF = function(translation, euler)
{
  var geomSDF = '<box>' + '<size>1.0 1.0 1.0</size>' + '</box>';

  return this.createSimpleShapeSDF('box', translation, euler, geomSDF);
};

/**
 * Creates SDF string of sphere geometry element
 * @param {THREE.Vector3} translation - the x,y,z position of
 * the box object
 * @param {THREE.Euler} euler - the euler rotation of the box object
 * @returns {string} geomSDF - geometry SDF string of the sphere
 */
GZ3D.SdfParser.prototype.createSphereSDF = function(translation, euler)
{
  var geomSDF = '<sphere>' + '<radius>0.5</radius>' + '</sphere>';

  return this.createSimpleShapeSDF('sphere', translation, euler, geomSDF);
};

/**
 * Creates SDF string of cylinder geometry element
 * @param {THREE.Vector3} translation - the x,y,z position of
 * the box object
 * @param {THREE.Euler} euler - the euler rotation of the cylinder object
 * @returns {string} geomSDF - geometry SDF string of the cylinder
 */
GZ3D.SdfParser.prototype.createCylinderSDF = function(translation, euler)
{
  var geomSDF = '<cylinder>' + '<radius>0.5</radius>' + '<length>1.0</length>'
          + '</cylinder>';

  return this.createSimpleShapeSDF('cylinder', translation, euler, geomSDF);
};

/**
 * Download a file from url.
 * @param {string} url - full URL to an SDF file.
 */
GZ3D.SdfParser.prototype.fileFromUrl = function(url)
{
  var xhttp = new XMLHttpRequest();
  xhttp.overrideMimeType('text/xml');
  xhttp.open('GET', url, false);

  try
  {
    xhttp.send();
  }
  catch(err)
  {
    console.log('Failed to get URL [' + url + ']: ' + err.message);
    return;
  }

  if (xhttp.status !== 200)
  {
    console.log('Failed to get URL [' + url + ']');
    return;
  }
  return xhttp.responseXML;
};
