from pathlib import Path
import json, math, struct

OUT = Path(__file__).resolve().parents[1] / 'public/models/imported'
OUT.mkdir(parents=True, exist_ok=True)
INDEX = {}

class Model:
    def __init__(self):
        self.data = bytearray()
        self.doc = {'asset': {'version': '2.0', 'generator': 'Cloud Course original model author'}, 'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'materials': [], 'bufferViews': [], 'accessors': []}

    def accessor(self, values, size, kind='FLOAT'):
        while len(self.data) % 4: self.data.append(0)
        start = len(self.data)
        flat = [v for row in values for v in (row if isinstance(row, (list, tuple)) else [row])]
        code, component = ('f', 5126) if kind == 'FLOAT' else ('H', 5123)
        self.data.extend(struct.pack('<' + code * len(flat), *flat))
        view = len(self.doc['bufferViews'])
        self.doc['bufferViews'].append({'buffer': 0, 'byteOffset': start, 'byteLength': len(self.data)-start})
        accessor = {'bufferView': view, 'componentType': component, 'count': len(values), 'type': {1:'SCALAR', 3:'VEC3', 4:'VEC4'}[size]}
        if kind == 'FLOAT':
            rows = [row if isinstance(row, (list, tuple)) else [row] for row in values]
            accessor['min'] = [min(row[i] for row in rows) for i in range(size)]
            accessor['max'] = [max(row[i] for row in rows) for i in range(size)]
        self.doc['accessors'].append(accessor)
        return len(self.doc['accessors'])-1

    def sphere(self, name, center, scale, color, segments=20, rings=12):
        positions, normals, indices = [], [], []
        for j in range(rings+1):
            latitude = math.pi * j/rings
            for i in range(segments+1):
                angle = 2*math.pi*i/segments
                unit = (math.sin(latitude)*math.cos(angle), math.cos(latitude), math.sin(latitude)*math.sin(angle))
                positions.append(tuple(unit[k]*scale[k] for k in range(3)))
                normal = [unit[k]/scale[k] for k in range(3)]
                length = math.sqrt(sum(n*n for n in normal))
                normals.append(tuple(n/length for n in normal))
        for j in range(rings):
            for i in range(segments):
                a=j*(segments+1)+i; b=a+segments+1
                indices.extend((a,a+1,b,a+1,b+1,b))
        return self.mesh(name, positions, normals, indices, center, color)

    def box(self, name, center, size, color):
        p, n, indices = [], [], []
        for axis in range(3):
            for sign in [-1,1]:
                other = [k for k in range(3) if k != axis]
                start = len(p)
                for a,b in [(-1,-1),(-1,1),(1,1),(1,-1)]:
                    q = [0,0,0]; normal = [0,0,0]
                    q[axis]=sign*size[axis]/2; q[other[0]]=a*size[other[0]]/2; q[other[1]]=b*size[other[1]]/2
                    normal[axis]=sign;p.append(q);n.append(normal)
                order = [0,1,2,0,2,3] if sign == (-1 if axis != 1 else 1) else [0,2,1,0,3,2]
                indices.extend(start+x for x in order)
        return self.mesh(name,p,n,indices,center,color)

    def mesh(self,name,p,n,indices,center,color):
        material = len(self.doc['materials'])
        self.doc['materials'].append({'name':name, 'pbrMetallicRoughness':{'baseColorFactor':[*color,1], 'metallicFactor':0, 'roughnessFactor':0.46}})
        mesh = len(self.doc['meshes'])
        self.doc['meshes'].append({'primitives':[{'attributes':{'POSITION':self.accessor(p,3),'NORMAL':self.accessor(n,3)},'indices':self.accessor(indices,1,'INT'),'material':material}]})
        node = len(self.doc['nodes'])
        self.doc['nodes'].append({'name':name,'mesh':mesh,'translation':center})
        self.doc['scenes'][0]['nodes'].append(node)
        return node

    def animate(self, name, node_values, times):
        samplers, channels = [], []
        for node, values in node_values:
            sampler=len(samplers)
            samplers.append({'input':self.accessor(times,1),'output':self.accessor(values,3),'interpolation':'LINEAR'})
            channels.append({'sampler':sampler,'target':{'node':node,'path':'translation'}})
        self.doc.setdefault('animations',[]).append({'name':name,'samplers':samplers,'channels':channels})

    def save(self, name):
        while len(self.data)%4:self.data.append(0)
        self.doc['buffers']=[{'byteLength':len(self.data)}]
        encoded=json.dumps(self.doc,separators=(',',':')).encode()
        while len(encoded)%4:encoded+=b' '
        result=struct.pack('<4sII',b'glTF',2,12+8+len(encoded)+8+len(self.data))
        result+=struct.pack('<I4s',len(encoded),b'JSON')+encoded
        result+=struct.pack('<I4s',len(self.data),b'BIN\0')+self.data
        (OUT/(name+'.glb')).write_bytes(result)
        minimum = [float('inf')] * 3
        maximum = [-float('inf')] * 3
        for node in self.doc['nodes']:
            position = self.doc['accessors'][self.doc['meshes'][node['mesh']]['primitives'][0]['attributes']['POSITION']]
            for axis in range(3):
                minimum[axis] = min(minimum[axis], position['min'][axis] + node['translation'][axis])
                maximum[axis] = max(maximum[axis], position['max'][axis] + node['translation'][axis])
        INDEX[name] = {'url': '/models/imported/' + name + '.glb', 'dims': {'footprint': {'w': maximum[0]-minimum[0], 'd': maximum[2]-minimum[2]}, 'center': {'x': (maximum[0]+minimum[0])/2, 'z': (maximum[2]+minimum[2])/2}, 'minY': minimum[1], 'maxY': maximum[1]}}
        if 'animations' in self.doc: INDEX[name]['clips'] = [clip['name'] for clip in self.doc['animations']]
        print(name,len(result))

for name,width,color in [('course_pad',6,(0.10,0.72,0.82)),('course_step',3,(0.17,0.81,0.78)),('course_checkpoint',6,(1,0.72,0.15)),('course_finish',6,(0.59,0.32,0.87))]:
    m=Model()
    m.box('flat inflatable deck',[0,0.40,0],[width-0.5,0.64,width-0.5],color)
    for z in [-width/2+0.22,width/2-0.22]:m.sphere('seamed rim',[0,0.40,z],[width/2,0.40,0.22],color)
    for x in [-width/2+0.22,width/2-0.22]:m.sphere('seamed rim',[x,0.40,0],[0.22,0.40,width/2-0.22],color)
    for z in [-0.95,0,0.95]:m.box('route stripe',[0,0.727,z],[0.75,0.02,0.25],(0.98,0.97,0.87))
    m.save(name)

m=Model();m.sphere('coral bumper',[0,0.9,0],[0.6,0.9,0.6],(0.97,0.30,0.27));m.sphere('cream cap',[0,1.5,0],[0.43,0.22,0.43],(1,0.93,0.77));m.save('course_bumper')

m=Model()
body=m.sphere('cream runner',[0,1.0,0],[0.48,0.76,0.38],(1,0.93,0.79))
m.sphere('coral bib',[0,0.91,0.30],[0.32,0.34,0.13],(0.97,0.30,0.27))
for x in [-0.15,0.15]:m.sphere('dark eye',[x,1.25,0.355],[0.055,0.09,0.035],(0.055,0.075,0.15))
feet=[]
for x in [-0.26,0.26]:feet.append(m.sphere('runner foot',[x,0.14,0.08],[0.26,0.14,0.30],(0.97,0.30,0.27)))
for x in [-0.43,0.43]:m.sphere('runner hand',[x,0.94,0],[0.12,0.28,0.16],(1,0.93,0.79))
m.animate('Idle',[(body,[[0,1.0,0],[0,1.03,0],[0,1.0,0]])],[0,0.8,1.6])
for name,period,lift in [('Walk',0.6,0.10),('Run',0.4,0.16)]:
    m.animate(name,[(feet[0],[[-0.26,0.14,0.08],[-0.26,0.14+lift,0.21],[-0.26,0.14,0.08],[-0.26,0.14,-0.05],[-0.26,0.14,0.08]]),(feet[1],[[0.26,0.14,0.08],[0.26,0.14,-0.05],[0.26,0.14,0.08],[0.26,0.14+lift,0.21],[0.26,0.14,0.08]])],[0,period/4,period/2,3*period/4,period])
m.save('course_runner')

(OUT.parents[2] / 'src/game/model-index.json').write_text(json.dumps(INDEX, indent=2) + '\n')
