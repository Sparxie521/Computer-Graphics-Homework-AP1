# AP1 · 交互式 2D 分形：Sierpinski 垫片（混沌游戏 + 递归细分）

计算机图形学课程作业 AP1 完整实现。基于 WebGL 2.0（GLSL ES 3.00），使用教材
《Interactive Computer Graphics》（Angel & Shreiner，8E）配套的 Common 库
（MV.js / flatten.js / initShaders.js / utility.js），
## 一、快速开始

项目为纯静态网页，无需构建。

### 本地运行

```powershell
cd ap1-sierpinski
python -m http.server 8080
```

然后浏览器打开：<http://localhost:8080/index.html>

> 说明：WebGL 页面必须通过 HTTP 服务访问（直接双击 `file://` 打开可能因
> 跨域限制导致着色器无法加载），用任意静态服务器均可（`npx serve`、VSCode
> Live Server 等）。

---

## 二、两种算法原理

### 2.1 混沌游戏（Chaos Game，Sierpinski 垫片）

**算法**：任取三角形三顶点 `v0, v1, v2` 与一个随机初始点 `p0`，反复迭代：

```
p_{k+1} = p_k + r · (v_i − p_k)   （每步随机选 v_i，r = 0.5）
```

即每步把当前点向随机选中的顶点移动一半距离。上万次迭代后，点的分布
几乎必然收敛到 Sierpinski 垫片的吸引子——所有点落在垫片上，
中心空洞永远不会被命中。

**实现**（`Geom.chaosPoints(n, vertices, ratio)`）：
每次迭代生成两个点（对称技巧：取 `p` 与 `1−p` 镜像），把点直接写入
Float32Array 供 `gl.POINTS` 一次绘制；初始点随机，因此「重新生成」
每次结果细节不同（这是混沌过程的正确表现）。

> 课上可答：这本质是**迭代函数系统（IFS）**——一组仿射压缩映射
> `f_i(x) = r·x + (1−r)·v_i` 的吸引子，Hutchinson 定理保证其存在唯一性。

### 2.2 递归细分（Recursive Subdivision）

**算法**：`subdivide(triangle, depth)` 对三角形 `a, b, c` 递归：

- `depth = 0`：直接输出该三角形（实体模式）。
- `depth > 0`：取三边中点 `mab, mbc, mca`，挖掉中间的小三角形，
  对剩下的三个角三角形各递归一次（`depth−1`）。

`depth = d` 生成 `3^d` 个三角形（顶点经索引去重），与经典结论一致：
d=0→1、d=1→3、d=2→9、…、d=5→243。

**实现**（`Geom.subdivideGasket(depth)`）：
递归生成三角形列表后统一做「顶点索引去重 + 边去重」，得到三套独立缓冲：
`points`（点云顶点）、`edges`（去重后的线段）、`faces`（三角形索引），
分别对应 P / L / T 三种绘制模式，互不依赖、一次计算多次绘制。

---

## 三、交互说明

| 操作 | 效果 |
|---|---|
| 左键拖拽 | 2D 垫片 / 分形：平移；3D 四面体：旋转视角 |
| 滚轮 | 2D：以光标为锚点缩放；3D：拉近 / 拉远（dist 2.2–14） |
| 1 / 2 / 3 | 垫片 / 四面体：点云 / 线框 / 实体切换；分形场景：切换调色板 |
| 空格 | 垫片：逐点生长暂停 / 继续；分形：Julia 参数动画开关 |
| R | 重新生成（混沌游戏重随机 / 重置分形视角） |
| 0 | 重置视角 |
| 面板 | 场景（垫片 / 四面体 / 分形）、点数、深度、n、r、点大小、配色、四面体深度、自动旋转、迭代次数、Julia c 等 |

---

## 四、三种模式截图

- **点云**（混沌游戏 8,000 点）：`screenshots/s2-chaos-points.png`
- **线框**（递归细分 depth=5，1,458 条边）：`screenshots/s3-subdiv-lines.png`
- **实体**（递归细分 depth=5，243 个三角形）：`screenshots/s4-subdiv-solid.png`

另有：生长动画过程 `s1-points-growing.png`、四面体三模式 `s6/s7`、
Mandelbrot `s8`、Julia `s9`。

---

## 六、代码结构

```
ap1-sierpinski/
├── index.html          # 页面骨架 + 参数面板 DOM + 4 组 GLSL ES 3.00 着色器
├── js/
│   ├── geometry.js     # 几何生成：chaosPoints / subdivideGasket / subdivideTetra / polygonVertices
│   ├── interaction.js  # 交互：mousedown/mousemove/mouseup/wheel/keydown 监听，回调转发
│   ├── ui.js           # UI：控件绑定、值标签、场景可见性、状态栏
│   └── main.js         # 主程序：GL 初始化、状态、VBO、配色、渲染循环、输入联动
├── Common/             # 教材官方配套库（见下方出处）
└── screenshots/        # 三模式 + 扩展截图
```

分层原则：**geometry 只算几何，interaction 只收输入，ui 只碰 DOM，
main 统一调度**——面试/答辩可强调的点。

### 技术要点：MV.js 矩阵与 WebGL 列主序（答辩亮点）

教材 MV.js 以**行主序**嵌套数组存矩阵（`out[row][col]`），`flatten()`
按行展平；而 WebGL `uniformMatrix4fv(transpose=false)` 按**列主序**解析，
直接上传等于把矩阵转置。对纯 2D（z=0）转置前后结果相同，所以垫片「看似正常」；
但 3D 透视投影会被彻底破坏（顶点全部跑到视锥外）。本项目统一在上传前转置
（`main.js` 中 `uploadMat4()`），3D 四面体因此正确渲染——这是排查 3D 白屏
后定位到的根因，也是演示时可主动讲的加分点。

---

## 七、Common 库出处

`Common/` 下四个文件为《Interactive Computer Graphics: A Top-Down Approach
with WebGL》8E 官方配套代码，取自：
`https://www.interactivecomputergraphics.com/8E/Code/Common/`
（MV.js 27,948 B / initShaders.js 1,890 B / flatten.js 442 B / utility.js 2,055 B），
仅做矩阵运算与着色器编译辅助，未修改。

---

## 八、已测试项

本地 `python -m http.server 8080` 服务 + 真实浏览器逐项实测通过：

- 混沌点云 0 → 8,000 逐点生长；空格暂停（点数冻结）→ 继续恢复
- 键盘 1/2/3 三模式切换；混沌模式按 2/3 自动转递归细分（混沌仅点云）
- 递归细分 d=5：线框 1,458 边、实体 243 三角形（= 3⁵，深度正确性验证）
- 四面体 E3：d=3 → 顶点 130 / 边 768 / 面 256；实体/线框/点云 + 自动旋转
- Mandelbrot / Julia 渲染、调色板 1/2/3 切换、空格 Julia 动画、滚轮放大细节
- 拖拽平移与锚点缩放数值验证（cam2d.cx/cy/zoom 正确变化）
- 5 边形混沌（E1，n=5）正常
- 控制台 0 错误

---

*AP1 · 计算机图形学 · 完成于 2026-10*
