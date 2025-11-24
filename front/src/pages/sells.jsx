import React, { useState, useRef, useEffect } from "react";
import "../App.css";
import "../print-styles.css";
import { useNavigate, useLocation } from "react-router-dom";
import { fetchWithAuth } from "../utils/auth";
import {
  FaPlus,
  FaSave,
  FaTimes,
  FaEdit,
  FaTrash,
  FaEye,
  FaCopy,
  FaFilePdf,
  FaMoneyCheckAlt,
  FaUser,
  FaList,
  FaPrint,
  FaDownload,
  FaFilter,
  FaCalendarAlt,
  FaChartBar,
} from "react-icons/fa";

// Endpoints
const API_COTIZACIONES =
  "https://estadias1-backend-production.up.railway.app/api/ordenes";
const API_CLIENTES =
  "https://estadias1-backend-production.up.railway.app/clientes";
const API_PRODUCTOS =
  "https://estadias1-backend-production.up.railway.app/productos";

const initialCotizacion = {
  ID_cliente: "",
  nombre: "",
  incluir_iva: false,
  productos: [], // [{ productoId, cantidad, tipo_medida, descripcion }]
  anticipo: 0,
  status: "pendiente",
};

const resolveUnidadMedidaProducto = (producto) => {
  if (!producto) return "m2";

  const unidadCruda =
    producto.unidadMedida || producto.unidad_medida || producto.tipo_medida;
  if (unidadCruda) {
    const normalized = String(unidadCruda).toLowerCase();
    if (normalized.includes("pieza")) return "piezas";
    if (normalized.includes("m2") || normalized.includes("m²")) return "m2";
  }

  const hasM2 =
    producto.cantidad_m2 !== null &&
    producto.cantidad_m2 !== undefined &&
    producto.medida_por_unidad !== null &&
    producto.medida_por_unidad !== undefined;
  const isSoloPiezas =
    producto.cantidad_piezas !== null &&
    producto.cantidad_piezas !== undefined &&
    (producto.cantidad_m2 === null || producto.cantidad_m2 === undefined);

  if (hasM2) return "m2";
  if (isSoloPiezas) return "piezas";
  return "m2";
};

const normalizeProducto = (producto) => {
  if (!producto) return producto;
  const unidad = resolveUnidadMedidaProducto(producto);
  const precioParsed = Number(producto.precio);
  const precioNumber = Number.isFinite(precioParsed)
    ? precioParsed
    : Number(producto.precioNumber || 0) || 0;

  return {
    ...producto,
    unidadMedida: unidad,
    precioNumber,
  };
};

const Sells = () => {
  // Helper para mostrar estados con etiquetas amigables
  const renderStatus = (s) => {
    if (!s) return "-";
    const key = String(s).toLowerCase();
    const map = {
      pendiente: "Pendiente",
      pagado: "Pagado",
      cancelado: "Cancelado",
      en_proceso: "En proceso",
      fabricado: "Fabricado",
      espera_material: "En espera de material",
      entregado: "Entregado",
      terminado: "Terminado",
    };
    if (map[key]) return map[key];
    const label = String(s).replaceAll("_", " ");
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  // Navbar / estado global de pantalla
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const menuRef = useRef();
  const navigate = useNavigate();
  const location = useLocation();
  const authFetch = (url, options) => fetchWithAuth(url, navigate, options);

  // Cargar usuario para mostrar nombre en la barra y validar sesión
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/");
      return;
    }
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      if (u && u.nombre) setUserName(u.nombre);
    } catch {
      /* ignore */
    }
  }, [navigate]);

  // Rol
  let isAdmin = false;
  try {
    const userObj = JSON.parse(localStorage.getItem("user") || "{}");
    isAdmin = String(userObj?.rol || "").toLowerCase() === "admin";
  } catch {}

  // Datos
  const [cotizaciones, setCotizaciones] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);

  // UI/Modal
  const [modalOpen, setModalOpen] = useState(null); // null | 'add' | 'edit' | 'confirmVenta'
  const [ventaResumen, setVentaResumen] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsData, setDetailsData] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [productosBloqueados, setProductosBloqueados] = useState(false);
  const [modalInfo, setModalInfo] = useState("");
  // Reporte global por cliente
  const [reportOpen, setReportOpen] = useState(false);
  // Marca de último ajuste por cotización para mostrar badge en detalles
  const [adjustFlags, setAdjustFlags] = useState({});
  // Guardar último resumen de ajustes para mostrarlo
  // Removed unused adjustSummaries state (was legacy from previous inventory adjustment UI)
  // Resumen de confirmación de inventario (piezas descontadas)
  const [confirmSummaryOpen, setConfirmSummaryOpen] = useState(false);
  const [confirmSummary, setConfirmSummary] = useState(null);
  // Confirm modal - anticipo editable
  const [confirmAbono, setConfirmAbono] = useState("");
  const [confirmObs, setConfirmObs] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);
  // Filtro de cotizaciones
  const [cotFilterText, setCotFilterText] = useState("");
  const [cotFilterField, setCotFilterField] = useState("cliente");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [cotOrder, setCotOrder] = useState("recientes"); // 'recientes' | 'antiguos'
  
  // Filtros para el reporte de ventas
  const [reportFilters, setReportFilters] = useState({
    cliente: "",
    fechaInicio: "",
    fechaFin: "",
    estados: ["pendiente", "pagado", "en_proceso", "fabricado", "entregado"]
  });

  // Estados para reporte global por fechas
  const [globalReportOpen, setGlobalReportOpen] = useState(false);
  const [globalFilters, setGlobalFilters] = useState({
    fechaInicio: "",
    fechaFin: "",
    estados: ["pendiente", "pagado", "en_proceso", "fabricado", "entregado"]
  });

  // Formulario cotización
  const [form, setForm] = useState(initialCotizacion);
  // Eliminado buscador de cliente en modal para ahorrar espacio
  // opcional: búsqueda de productos (no usada actualmente)

  const getProductoInfo = (productoId) => {
    const prod = productos.find((p) => p.ID === productoId);
    if (!prod) {
      return {
        prod: null,
        unidad: null,
        precio: 0,
        medidaPorUnidad: null,
        stockPiezas: null,
        stockM2: null,
      };
    }

    const unidad = prod.unidadMedida || resolveUnidadMedidaProducto(prod);
    const precio =
      typeof prod.precioNumber === "number" && !Number.isNaN(prod.precioNumber)
        ? prod.precioNumber
        : Number(prod.precio || 0) || 0;
    const medidaPorUnidad =
      prod.medida_por_unidad !== null && prod.medida_por_unidad !== undefined
        ? Number(prod.medida_por_unidad)
        : null;
    const stockPiezas =
      prod.cantidad_piezas !== null && prod.cantidad_piezas !== undefined
        ? Number(prod.cantidad_piezas)
        : null;
    const stockM2 =
      prod.cantidad_m2 !== null && prod.cantidad_m2 !== undefined
        ? Number(prod.cantidad_m2)
        : null;

    return {
      prod,
      unidad,
      precio,
      medidaPorUnidad,
      stockPiezas,
      stockM2,
    };
  };

  const getLineaTipoMedida = (linea) => {
    if (!linea) return "m2";
    if (linea.tipo_medida) return linea.tipo_medida;
    const info = getProductoInfo(linea.productoId);
    return info.unidad || "m2";
  };

  const calcularSubtotalLocal = (lista) =>
    (lista || []).reduce((acc, item) => {
      const cantidad = Number(item?.cantidad || 0);
      if (!cantidad || Number.isNaN(cantidad)) return acc;
      const { precio } = getProductoInfo(item.productoId);
      if (!precio || Number.isNaN(precio)) return acc;
      return acc + precio * cantidad;
    }, 0);

  // Fecha y hora
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options = {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      };
      setDateStr(now.toLocaleDateString("es-MX", options));
      setTimeStr(now.toLocaleTimeString("es-MX", { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Cargar clientes, productos y cotizaciones
  const fetchAll = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const [resClientes, resProductos, resCots] = await Promise.all([
        authFetch(API_CLIENTES),
        authFetch(API_PRODUCTOS),
        authFetch(API_COTIZACIONES),
      ]);
      const parseSafe = async (res) => {
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      };
      const cData = await parseSafe(resClientes);
      const pData = await parseSafe(resProductos);
      const oData = await parseSafe(resCots);
      const clientesArr = Array.isArray(cData)
        ? cData
        : cData?.clientes || cData?.data || [];
      const productosArr = Array.isArray(pData)
        ? pData
        : pData?.productos || pData?.data || [];
      const cotArr = Array.isArray(oData?.data)
        ? oData.data
        : Array.isArray(oData)
        ? oData
        : [];
      setClientes(Array.isArray(clientesArr) ? clientesArr : []);
      const productosNormalizados = Array.isArray(productosArr)
        ? productosArr.map(normalizeProducto)
        : [];
      setProductos(productosNormalizados);
      setCotizaciones(Array.isArray(cotArr) ? cotArr : []);
    } catch (err) {
      console.error("fetchAll error:", err);
      if (err?.message === "Sesión expirada") {
        setClientes([]);
        setProductos([]);
        setCotizaciones([]);
        setErrorMsg(
          "Sesión expirada. Ingresa nuevamente para continuar con Ventas."
        );
      } else {
        setErrorMsg("No se pudieron cargar clientes/productos/cotizaciones");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // Asegura que no quede ningún modal/overlay abierto al entrar a Ventas
  useEffect(() => {
    setModalOpen(null);
    setDetailsOpen(false);
    setReportOpen(false);
    setShowDeleteConfirm(false);
    setShowLogoutConfirm(false);
    setConfirmSummaryOpen(false);
  }, []);

  // Cerrar menú usuario al hacer click fuera
  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Modal handlers
  const openAddModal = () => {
    setForm({ ...initialCotizacion });
    setModalOpen("add");
    setErrorMsg("");
    setProductosBloqueados(false);
    setModalInfo("");
  };

  // Foco inteligente por mensaje de error del backend
  const focusAccordingToError = (msg) => {
    const m = (msg || "").toLowerCase();
    // Anticipo
    if (m.includes("anticipo")) {
      const el = document.getElementById("anticipo-input");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
      return;
    }
    // Cliente
    if (m.includes("cliente")) {
      const el = document.getElementById("cliente-select");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
      return;
    }
    // Inventario insuficiente / producto
    if (m.includes("inventario") || m.includes("producto")) {
      const el =
        document.getElementById("prod-0-productoId") ||
        document.querySelector('[id^="prod-"][id$="-productoId"]');
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
      return;
    }
    // Fallback: al inicio del modal
    const modal =
      document.querySelector(".modal-content.compact") ||
      document.querySelector(".modal-content");
    if (modal) modal.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openConfirmVenta = async (cot) => {
    setErrorMsg("");
    try {
      const id = cot.ID || cot.id;
      // Traer orden + historial de anticipos en paralelo
      const [resOrden, resHist] = await Promise.all([
        authFetch(`${API_COTIZACIONES}/${id}`),
        authFetch(`${API_COTIZACIONES}/${id}/anticipos`),
      ]);
      const [txtOrden, txtHist] = await Promise.all([
        resOrden.text(),
        resHist.text(),
      ]);
      let dataOrden, dataHist;
      try {
        dataOrden = JSON.parse(txtOrden);
      } catch {
        dataOrden = { success: false, message: txtOrden };
      }
      try {
        dataHist = JSON.parse(txtHist);
      } catch {
        dataHist = { success: false, message: txtHist };
      }
      if (!resOrden.ok || dataOrden?.success === false)
        throw new Error(dataOrden?.message || "No se pudo cargar la orden");
      const payload = dataOrden.data || dataOrden;
      const ord = payload.cotizacion || payload;
      const prods = Array.isArray(payload.productos) ? payload.productos : [];
      const histArr =
        resHist.ok && dataHist?.success !== false
          ? dataHist?.data?.historial || []
          : [];

      const total = Number(ord.total || 0);
      const anticipo = Number(ord.anticipo || 0);
      const resto = Number((total - anticipo).toFixed(2));
      const vendedor =
        ord.Usuario?.nombre ||
        ord.usuario?.nombre ||
        cot.Usuario?.nombre ||
        cot.usuario?.nombre ||
        "-";
      const productosNorm = prods
        .map((p) => {
          const productoId =
            p.productoId || p.ID_producto || p.Producto?.ID || p.producto?.ID;
          if (!productoId) return null;

          const infoProducto = getProductoInfo(productoId);
          const normalizarTipo = (valor) => {
            if (!valor) return null;
            const text = String(valor).toLowerCase();
            if (text.includes("pieza")) return "piezas";
            if (text.includes("m2") || text.includes("m²")) return "m2";
            return null;
          };

          const tipoMedida =
            normalizarTipo(p.tipo_medida) ||
            normalizarTipo(p.unidad_medida) ||
            normalizarTipo(p.unidadMedida) ||
            normalizarTipo(p.tipoMedida) ||
            normalizarTipo(infoProducto.unidad) ||
            normalizarTipo(
              p.Producto ? resolveUnidadMedidaProducto(p.Producto) : null
            ) ||
            normalizarTipo(
              p.producto ? resolveUnidadMedidaProducto(p.producto) : null
            ) ||
            "m2";

          return {
            productoId,
            cantidad: p.cantidad,
            tipo_medida: tipoMedida,
            tipoFigura: p.tipoFigura || p.tipo_figura || p.figura,
            medidas: p.medidas || p.medida || p.medida_custom,
          };
        })
        .filter(Boolean);

      setVentaResumen({
        ID: ord.ID || ord.id,
        ID_cliente: ord.ID_cliente,
        total,
        anticipo,
        resto,
        vendedor,
        productos: productosNorm,
        historialAnticipos: histArr,
      });
      setConfirmAbono("");
      setConfirmObs("");
      setModalOpen("confirmVenta");
    } catch (e) {
      setErrorMsg(e.message || "No se pudo abrir el modal de venta");
    }
  };

  // Agregar anticipo (abono) desde el modal de confirmación
  const handleAgregarAnticipo = async () => {
    if (!ventaResumen) return;
    const monto = Number(confirmAbono || 0);
    if (isNaN(monto) || monto <= 0) {
      setErrorMsg("Ingresa un monto válido para el anticipo.");
      return;
    }
    try {
      setConfirmLoading(true);
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const id = ventaResumen.ID || ventaResumen.id;
      const res = await authFetch(`${API_COTIZACIONES}/${id}/anticipos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          anticipo: monto,
          ID_usuario: user?.ID,
          observaciones: confirmObs || null,
        }),
      });
      const txt = await res.text();
      let data;
      try {
        data = JSON.parse(txt);
      } catch {
        data = { success: false, message: txt };
      }
      if (!res.ok || data?.success === false)
        throw new Error(data?.message || "No se pudo agregar el anticipo");
      // Actualizar valores locales del resumen
      const anticipoNuevo = Number((ventaResumen.anticipo || 0) + monto);
      const restoNuevo = Number((ventaResumen.total || 0) - anticipoNuevo);
      setVentaResumen((prev) => ({
        ...prev,
        anticipo: anticipoNuevo,
        resto: restoNuevo,
      }));
      setConfirmAbono("");
      setConfirmObs("");
      setErrorMsg("");
    } catch (e) {
      setErrorMsg(e.message || "No se pudo agregar el anticipo");
    } finally {
      setConfirmLoading(false);
    }
  };
  void handleAgregarAnticipo;

  const openDetails = async (cot) => {
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailsData(null);
    try {
      const id = cot.ID || cot.id;
      // Obtener detalles y también historial de anticipos en paralelo
      const [res, resAntHist] = await Promise.all([
        authFetch(`${API_COTIZACIONES}/${id}`),
        authFetch(`${API_COTIZACIONES}/${id}/anticipos`),
      ]);
      const [txt, txtAntHist] = await Promise.all([
        res.text(),
        resAntHist.text(),
      ]);
      let data, dataAntHist;
      try {
        data = JSON.parse(txt);
      } catch {
        data = { success: false, message: txt };
      }
      try {
        dataAntHist = JSON.parse(txtAntHist);
      } catch {
        dataAntHist = { success: false, message: txtAntHist };
      }
      if (!res.ok || data?.success === false)
        throw new Error(data?.message || "No se pudo cargar detalles");
      // si historial falla, seguimos mostrando detalles
      const base = data.data || data;
      const hist =
        resAntHist.ok && dataAntHist?.success !== false
          ? dataAntHist?.data?.historial || []
          : [];
      setDetailsData({
        ...base,
        anticipos: hist,
        anticipos_meta: dataAntHist?.data?.orden || null,
      });
    } catch (err) {
      setErrorMsg(err.message || "No se pudo cargar detalles");
    } finally {
      setDetailsLoading(false);
    }
  };

  const [editTarget, setEditTarget] = useState(null);

  const openEditModal = async (cot) => {
    const rawStatus = (cot.status || "").toLowerCase();
    const esPendiente = rawStatus === "pendiente";
    setProductosBloqueados(!esPendiente);
    setModalInfo(
      esPendiente
        ? ""
        : "Los productos se muestran solo de lectura porque la cotización no está en estado pendiente. Ajusta el estado y los datos generales desde aquí."
    );
    // Abrir modal con datos base
    setEditTarget(cot);
    setModalOpen("edit");
    setErrorMsg("");

    // Precargar valores básicos (incluir título e IVA)
    setForm((prev) => ({
      ...prev,
      ID_cliente: cot.ID_cliente,
      nombre: cot.nombre || cot.titulo || "",
      incluir_iva: Boolean(cot.incluir_iva),
      productos: [], // se cargarán abajo desde el detalle
      anticipo: cot.anticipo || 0,
      status: cot.status || "pendiente",
    }));

    // Cargar productos reales de la cotización para permitir edición completa
    try {
      const res = await authFetch(`${API_COTIZACIONES}/${cot.ID || cot.id}`);
      const txt = await res.text();
      let data;
      try {
        data = JSON.parse(txt);
      } catch {
        data = { success: false, message: txt };
      }
      if (!res.ok || data?.success === false)
        throw new Error(
          data?.message || "No se pudo cargar productos de la cotización"
        );
      const payload = data.data || data;
      const productosDetalle = Array.isArray(payload?.productos)
        ? payload.productos
        : [];

      // Mapear al formato del formulario de edición/creación respetando unidad
      const mapped = productosDetalle
        .map((p) => {
          let prodId = Number(p.productoId || 0);
          if (!prodId && p.Producto) {
            prodId = Number(p.Producto.ID || p.Producto.id || 0);
          }

          const productoCatalogo =
            productos.find((prod) => prod.ID === prodId) || p.Producto || null;
          const tipoMedida =
            p.tipo_medida || resolveUnidadMedidaProducto(productoCatalogo);

          const cantidadCalculada =
            tipoMedida === "piezas"
              ? Number(
                  p.cantidad_piezas_calculada ??
                    p.cantidad ??
                    p.cantidad_calculada ??
                    0
                )
              : Number(
                  p.cantidad_m2_calculada ??
                    p.cantidad ??
                    p.cantidad_calculada ??
                    0
                );

          return {
            productoId: prodId,
            cantidad:
              Number.isFinite(cantidadCalculada) && cantidadCalculada > 0
                ? cantidadCalculada
                : "",
            descripcion: p.descripcion ?? "",
            tipo_medida: tipoMedida || "m2",
          };
        })
        .filter((item) => item.productoId);

      setForm((prev) => ({ ...prev, productos: mapped }));
    } catch (e) {
      console.error("No se pudieron cargar productos para editar:", e);
      // se deja el formulario con productos vacíos, usuario puede agregar si lo desea
    }
  };

  const closeModal = () => {
    setModalOpen(null);
    setForm(initialCotizacion);
    setErrorMsg("");
    setProductosBloqueados(false);
    setModalInfo("");
  };

  // Form handlers
  // Lista de clientes (sin buscador en modal de add/edit para mantener compacto)
  const filteredClientes = clientes;
  // Evita warning si el modal no está montado en esta vista
  void filteredClientes;

  // Para productos, usamos la lista completa en el selector

  // Productos en cotización
  const handleAddProducto = () => {
    if (productosBloqueados) return;
    setForm((prev) => ({
      ...prev,
      productos: [
        ...prev.productos,
        {
          productoId: "",
          cantidad: "", // cantidad según la unidad del producto
          descripcion: "",
          tipo_medida: "",
        },
      ],
    }));
  };
  void handleAddProducto;

  const handleRemoveProducto = (idx) => {
    if (productosBloqueados) return;
    setForm((prev) => {
      const next = [...prev.productos];
      next.splice(idx, 1);
      return { ...prev, productos: next };
    });
  };
  void handleRemoveProducto;

  const handleProductoChange = (idx, field, value) => {
    if (productosBloqueados) return;
    setForm((prev) => {
      const productosNext = [...prev.productos];
      if (!productosNext[idx]) return prev;

      const current = { ...productosNext[idx] };

      if (field === "productoId") {
        const productoId = value ? Number(value) : "";
        current.productoId = productoId;
        const info = productoId ? getProductoInfo(productoId) : {};
        current.tipo_medida = info.unidad || "m2";
        current.cantidad = "";
      } else if (field === "cantidad") {
        if (value === "") {
          current.cantidad = "";
        } else {
          const parsed = Number(value);
          if (!Number.isNaN(parsed)) {
            current.cantidad = parsed;
          }
        }
      } else {
        current[field] = value;
      }

      productosNext[idx] = current;
      return { ...prev, productos: productosNext };
    });
  };
  void handleProductoChange;

  // Validación con enfoque/scroll al primer error
  const validateFormAndFocus = () => {
    // Cliente
    if (!form.ID_cliente) {
      setErrorMsg("Selecciona un cliente.");
      const el = document.getElementById("cliente-select");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
      return false;
    }
    // Título
    if (!form.nombre || form.nombre.trim().length < 3) {
      setErrorMsg("Ingresa un título (mínimo 3 caracteres). ");
      const el = document.getElementById("titulo-input");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
      return false;
    }
    // Productos
    const debeValidarProductos = !productosBloqueados || modalOpen !== "edit";
    if (debeValidarProductos) {
      if (!form.productos || form.productos.length === 0) {
        setErrorMsg("Agrega al menos un producto.");
        return false;
      }
      for (let i = 0; i < form.productos.length; i++) {
        const p = form.productos[i];
        // productoId
        if (!p.productoId) {
          setErrorMsg(`Selecciona el producto #${i + 1}.`);
          const el = document.getElementById(`prod-${i}-productoId`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus();
          }
          return false;
        }
        const tipoMedida = getLineaTipoMedida(p);
        const unidadLabel = tipoMedida === "piezas" ? "piezas" : "m²";
        const cantidadVal =
          p.cantidad === "" || p.cantidad === null || p.cantidad === undefined
            ? NaN
            : Number(p.cantidad);
        if (!Number.isFinite(cantidadVal) || cantidadVal <= 0) {
          setErrorMsg(
            `Ingresa la cantidad en ${unidadLabel} (> 0) para el producto #${i + 1}.`
          );
          const el = document.getElementById(`prod-${i}-cantidad`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus();
          }
          return false;
        }
      }
    }
    return true;
  };

  // CRUD Cotizaciones
  const handleAdd = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (!user || !user.ID) {
      setErrorMsg("No se encontró el usuario autenticado. Inicia sesión.");
      return;
    }
    if (!validateFormAndFocus()) return;


    try {
      // Calcular totales locales
      const subtotal = calcularSubtotalLocal(form.productos);
      const ivaVal = form.incluir_iva ? subtotal * 0.16 : 0;
      const total = subtotal + ivaVal;

      // Validación: no permitir status 'pagado' si el anticipo es menor al total
      const statusToCheck = (form.status || "pendiente").toLowerCase();
      const anticipoVal = Number(form.anticipo || 0);
      if (statusToCheck === "pagado" && anticipoVal < total) {
        setErrorMsg("No puedes marcar como 'Pagado' si el pago no está completo.");
        return;
      }

      const cleanForm = {
        nombre: form.nombre,
        incluir_iva: !!form.incluir_iva,
        subtotal: Number(subtotal.toFixed(2)),
        iva: Number(ivaVal.toFixed(2)),
        total: Number(total.toFixed(2)),
        ID_usuario: user.ID,
        ID_cliente: form.ID_cliente,
        productos: form.productos.map((p) => {
          const tipoMedida = getLineaTipoMedida(p);
          const cantidad = Number(p.cantidad || 0);
          return {
            productoId: p.productoId,
            cantidad,
            tipo_medida: tipoMedida,
            descripcion: p.descripcion,
          };
        }),
        anticipo: form.anticipo || 0,
        status: form.status || "pendiente",
      };

      const res = await authFetch(API_COTIZACIONES, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cleanForm),
      });

      const txt = await res.text();
      let data;
      try {
        data = JSON.parse(txt);
      } catch {
        data = {
          success: false,
          message:
            txt && txt.trim().startsWith("<")
              ? "El servidor respondió con un error (HTML). Intenta más tarde."
              : txt,
        };
      }
      if (!res.ok || data?.success === false) {
        const msg = data?.message || data?.error || "Error al crear cotización";
        setErrorMsg(msg);
        setTimeout(() => focusAccordingToError(msg), 50);
        return;
      }

      closeModal();
      setForm(initialCotizacion);
      await fetchAll();
    } catch (err) {
      console.error("crear cotización error:", err);
      const msg = err?.message || "Error al crear la cotización";
      setErrorMsg(msg);
      setTimeout(() => focusAccordingToError(msg), 50);
    }
  };
  void handleAdd;

  const handleEdit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    if (!editTarget) {
      setErrorMsg("No hay cotización seleccionada");
      return;
    }
    if (!validateFormAndFocus()) return;


    const id = editTarget.ID || editTarget.id;
    const headers = {
      "Content-Type": "application/json",
    };

    // Preparar payload
    // Recalcular totales locales
    const subtotalCalc = calcularSubtotalLocal(form.productos);
    const ivaCalc = form.incluir_iva ? subtotalCalc * 0.16 : 0;
    const totalCalc = subtotalCalc + ivaCalc;

    // Validación: no permitir status 'pagado' si el anticipo es menor al total
    const statusToCheck = (form.status || "pendiente").toLowerCase();
    const anticipoVal = Number(form.anticipo || 0);
    if (statusToCheck === "pagado" && anticipoVal < totalCalc) {
      setErrorMsg("No puedes marcar como 'Pagado' si el pago no está completo.");
      return;
    }

    const payloadBase = {
      nombre: form.nombre,
      incluir_iva: !!form.incluir_iva,
      subtotal: Number(subtotalCalc.toFixed(2)),
      iva: Number(ivaCalc.toFixed(2)),
      total: Number(totalCalc.toFixed(2)),
      ID_cliente: form.ID_cliente,
      anticipo: form.anticipo,
      status: form.status,
    };

    if (!productosBloqueados) {
      payloadBase.productos = form.productos.map((p) => {
        const tipoMedida = getLineaTipoMedida(p);
        const cantidad = Number(p.cantidad || 0);
        return {
          productoId: p.productoId,
          cantidad,
          tipo_medida: tipoMedida,
          descripcion: p.descripcion,
        };
      });
    } else {
      const subtotalOriginal = Number(
        editTarget?.subtotal ??
          editTarget?.Subtotal ??
          editTarget?.sub_total ??
          subtotalCalc
      );
      const ivaOriginal = Number(
        editTarget?.iva ?? editTarget?.IVA ?? ivaCalc
      );
      const totalOriginal = Number(
        editTarget?.total ??
          editTarget?.Total ??
          (subtotalOriginal + ivaOriginal)
      );

      payloadBase.subtotal = Number(subtotalOriginal.toFixed(2));
      payloadBase.iva = Number(ivaOriginal.toFixed(2));
      payloadBase.total = Number(totalOriginal.toFixed(2));
    }

    const payload = payloadBase;

    try {
      const res = await authFetch(`${API_COTIZACIONES}/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      });
      const txt = await res.text();
      let data;
      try {
        data = JSON.parse(txt);
      } catch {
        data = {
          success: false,
          message:
            txt && txt.trim().startsWith("<")
              ? "El servidor respondió con un error (HTML). Intenta más tarde."
              : txt,
        };
      }
      if (!res.ok || data?.success === false) {
        const msg =
          data?.message || data?.error || "No se pudo actualizar la cotización";
        setErrorMsg(msg);
        setTimeout(() => focusAccordingToError(msg), 50);
        return;
      }

      // Guardar flag de ajuste si el backend reporta delta aplicado
      const applied =
        Boolean(data?.data?.ajusteInventarioAplicado) ||
        (Array.isArray(data?.data?.ajustes) &&
          data.data.ajustes.some((a) => a && a.deltaPiezas));
      setAdjustFlags((prev) => ({ ...prev, [id]: applied }));
      if (Array.isArray(data?.data?.ajustes)) {
        // Legacy: setAdjustSummaries removed; if ajustes data needed later, store via dedicated state hook.
      }


      setModalOpen(null);
      setEditTarget(null);
      setForm(initialCotizacion);
      await fetchAll();
    } catch (err) {
      setErrorMsg(err.message || "Error al editar la cotización");
    }
  };

  // Evita warning de variable sin usar si el modal de edición no se monta en ciertos estados
  void handleEdit;

  // Confirmar venta: no descuenta inventario automáticamente. Mantiene regla de >=70% para cambiar estado,
  // pero se permite abonar libremente antes de llegar al umbral.
  const handleConfirmVenta = async (liquidar = false) => {
    if (!ventaResumen) return;
    setErrorMsg("");
    const id = ventaResumen.ID || ventaResumen.id;
    try {
      // 1) Obtener detalles actuales
      const resDet = await authFetch(`${API_COTIZACIONES}/${id}`);
      const txtDet = await resDet.text();
      let dataDet;
      try {
        dataDet = JSON.parse(txtDet);
      } catch {
        dataDet = { success: false, message: txtDet };
      }
      if (!resDet.ok || dataDet?.success === false)
        throw new Error(
          dataDet?.message || "No se pudo obtener detalles de la orden"
        );
      const payload = dataDet.data || dataDet;
      const ord = payload.cotizacion || payload;
      const totalOrder = Number(ord.total || 0);
      let anticipoOrder = Number(ord.anticipo || 0);

      // Si se desea liquidar, actualizar anticipo = total
      if (liquidar && anticipoOrder < totalOrder) {
        const resAntPre = await authFetch(`${API_COTIZACIONES}/${id}/anticipo`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ anticipo: totalOrder }),
        });
        const txtAntPre = await resAntPre.text();
        let dAntPre;
        try {
          dAntPre = JSON.parse(txtAntPre);
        } catch {
          dAntPre = { success: false, message: txtAntPre };
        }
        if (!resAntPre.ok || dAntPre?.success === false)
          throw new Error(
            dAntPre?.message || "No se pudo liquidar antes de confirmar"
          );
        anticipoOrder = totalOrder;
      }

      // Validar anticipo mínimo 70% solo para confirmar estado; si no alcanza, salir silenciosamente
      const percentAfter =
        totalOrder > 0 ? (anticipoOrder / totalOrder) * 100 : 0;
      if (percentAfter < 70) {
        return;
      }
      // 2) Actualizar estado de la orden (sin tocar inventario)
      const newStatus = percentAfter >= 100 ? "pagado" : "en_proceso";
      const resSt = await authFetch(`${API_COTIZACIONES}/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const txtSt = await resSt.text();
      let dSt;
      try {
        dSt = JSON.parse(txtSt);
      } catch {
        dSt = { success: false, message: txtSt };
      }
      if (!resSt.ok || dSt?.success === false)
        throw new Error(
          dSt?.message || "No se pudo actualizar el estado de la venta"
        );

      // 3) Mostrar resumen/instrucción manual
      setConfirmSummary({
        nota_manual: true,
        status_aplicado: newStatus,
      });
      setConfirmSummaryOpen(true);
      setModalOpen(null);
      setVentaResumen(null);
      await fetchAll();
    } catch (e) {
      setErrorMsg(e.message || "No se puede realizar la venta");
      setTimeout(() => focusAccordingToError(e.message || ""), 50);
    }
  };

  // Duplicar cotización (para canceladas/pagadas o reordenar)
  const handleDuplicar = async (cot) => {
    try {
      const res = await authFetch(`${API_COTIZACIONES}/${cot.ID || cot.id}`);
      const txt = await res.text();
      let data;
      try {
        data = JSON.parse(txt);
      } catch {
        data = { success: false, message: txt };
      }
      if (!res.ok || data?.success === false)
        throw new Error(data?.message || "No se pudieron cargar los detalles");
      const payload = data.data || data;
      const productosDetalle = Array.isArray(payload?.productos)
        ? payload.productos
        : [];
      const mapped = productosDetalle.map((p) => {
        const productoIdRaw =
          p.productoId || p.Producto?.ID || p.ID_producto || "";
        const productoId =
          productoIdRaw !== "" && productoIdRaw !== null && productoIdRaw !== undefined
            ? Number(productoIdRaw)
            : null;
        const productoCatalogo =
          productos.find((prod) => prod.ID === productoId) ||
          p.Producto ||
          null;
        const tipoMedida =
          p.tipo_medida || resolveUnidadMedidaProducto(productoCatalogo);
        const cantidadBase =
          tipoMedida === "piezas"
            ? Number(
                p.cantidad_piezas_calculada ??
                  p.cantidad ??
                  p.cantidad_calculada ??
                  0
              )
            : Number(
                p.cantidad_m2_calculada ??
                  p.cantidad ??
                  p.cantidad_calculada ??
                  0
              );
        const cantidadNormalizada = Number.isFinite(cantidadBase) && cantidadBase > 0
          ? cantidadBase
          : 1;

        return {
          productoId: productoId ?? "",
          cantidad: cantidadNormalizada,
          tipo_medida: tipoMedida || "m2",
          tipoFigura: p.tipoFigura || p.tipo_figura || "rectangulo",
          base: p.base ?? null,
          altura: p.altura ?? null,
          radio: p.radio ?? null,
          base2: p.base2 ?? null,
          altura2: p.altura2 ?? null,
          soclo_base: p.soclo_base ?? null,
          soclo_altura: p.soclo_altura ?? null,
          cubierta_base: p.cubierta_base ?? null,
          cubierta_altura: p.cubierta_altura ?? null,
          descripcion: p.descripcion ?? "",
        };
      });
      setForm({
        ID_cliente: cot.ID_cliente || "",
        productos: mapped,
        anticipo: 0,
        status: "pendiente",
      });
      setErrorMsg("");
      setModalOpen("add");
      setTimeout(() => {
        const el = document.getElementById("cliente-select");
        if (el) el.focus();
      }, 50);
    } catch (err) {
      setErrorMsg(err.message || "No se pudo duplicar la cotización");
    }
  };

  // Actualizar estado de una cotización
  const updateStatus = async (cot, newStatus) => {
    try {
      const id = cot.ID || cot.id;
      const res = await authFetch(`${API_COTIZACIONES}/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const txt = await res.text();
      let data;
      try {
        data = JSON.parse(txt);
      } catch {
        data = { success: false, message: txt };
      }
      if (!res.ok || data?.success === false) {
        throw new Error(data?.message || "No se pudo actualizar el estado");
      }
      await fetchAll();
    } catch (err) {
      setErrorMsg(err.message || "No se pudo actualizar el estado");
    }
  };

  const handleGenerarPDF = async (cotId) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setErrorMsg(
          "No se encontró token de autenticación. Por favor, inicia sesión nuevamente."
        );
        return;
      }

      // Mostrar indicador de carga
      setLoading(true);

      // Hacer la petición con el token de autenticación
      const response = await authFetch(`${API_COTIZACIONES}/${cotId}/factura`, {
        method: "GET",
        headers: {
          Accept: "application/pdf",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Error al generar PDF: ${response.status} ${response.statusText}`
        );
      }

      // Obtener el PDF como blob
      const blob = await response.blob();

      // Crear URL temporal para el blob
      const url = window.URL.createObjectURL(blob);

      // Crear elemento 'a' temporal para la descarga
      const link = document.createElement("a");
      link.href = url;
      link.download = `factura_orden_${cotId}.pdf`;

      // Agregar al DOM, hacer click y remover
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Limpiar la URL temporal
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error al generar PDF:", error);
      setErrorMsg(`Error al generar el PDF: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      // Preferimos marcar como cancelado en lugar de borrar físicamente
      const res = await authFetch(`${API_COTIZACIONES}/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "cancelado" }),
      });
      const txt = await res.text();
      let data;
      try {
        data = JSON.parse(txt);
      } catch {
        data = { message: txt };
      }
      if (!res.ok || data?.success === false)
        throw new Error(
          data?.mensaje || data?.message || "No se pudo cancelar la cotización"
        );
      await fetchAll();
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    } catch (err) {
      setErrorMsg(err.message || "No se pudo cancelar la cotización");
    }
  };

  // Navbar/Logout
  const handleLogout = () => {
    setMenuOpen(false);
    setShowLogoutConfirm(true);
  };
  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/");
  };
  const cancelLogout = () => setShowLogoutConfirm(false);
  const handleConfig = () => {
    setMenuOpen(false);
    navigate("/config");
  };

  // Render
  return (
    <div className="-bg">
      <nav className="main-navbar guinda-navbar">
        <div className="nav-container">
          <div className="nav-left">
            <div
              className="nav-logo mobile-menu-toggle"
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              <img
                src="https://irp.cdn-website.com/d7ba7f52/dms3rep/multi/265.png"
                alt="Logo"
                className="logo-img"
              />
              <div className="nav-title">VENTAS</div>
            </div>
            <header className="header">
              <h1>
                VENTAS <FaMoneyCheckAlt className="iconName" />
              </h1>
            </header>
            <div className={`mobile-menu ${mobileMenuOpen ? "open" : ""}`}>
              <button
                className={`nav-btn${
                  location.pathname === "/home" ? " nav-btn-active" : ""
                }`}
                onClick={() => navigate("/home")}
              >
                Inicio
              </button>
              <button
                className={`nav-btn${
                  location.pathname === "/inventario" ? " nav-btn-active" : ""
                }`}
                onClick={() => navigate("/inventario")}
              >
                Inventario
              </button>
              <button
                className={`nav-btn${
                  location.pathname === "/ventas" ? " nav-btn-active" : ""
                }`}
                onClick={() => navigate("/ventas")}
              >
                Ventas
              </button>
              <button
                className={`nav-btn${
                  location.pathname === "/clientes" ? " nav-btn-active" : ""
                }`}
                onClick={() => navigate("/clientes")}
              >
                Clientes
              </button>
              {isAdmin && (
                <button
                  className={`nav-btn${
                    location.pathname === "/usuarios" ? " nav-btn-active" : ""
                  }`}
                  onClick={() => navigate("/usuarios")}
                >
                  Usuarios
                </button>
              )}
            </div>
          </div>
          <div className="nav-center">
            <button
              className={`nav-btn${
                location.pathname === "/home" ? " nav-btn-active" : ""
              }`}
              onClick={() => navigate("/home")}
            >
              Inicio
            </button>
            <button
              className={`nav-btn${
                location.pathname === "/inventario" ? " nav-btn-active" : ""
              }`}
              onClick={() => navigate("/inventario")}
            >
              Inventario
            </button>
            <button
              className={`nav-btn${
                location.pathname === "/ventas" ? " nav-btn-active" : ""
              }`}
              onClick={() => navigate("/ventas")}
            >
              Ventas
            </button>
            <button
              className={`nav-btn${
                location.pathname === "/clientes" ? " nav-btn-active" : ""
              }`}
              onClick={() => navigate("/clientes")}
            >
              Clientes
            </button>
            {isAdmin && (
              <button
                className={`nav-btn${
                  location.pathname === "/usuarios" ? " nav-btn-active" : ""
                }`}
                onClick={() => navigate("/usuarios")}
              >
                Usuarios
              </button>
            )}
          </div>
          <div className="nav-datetime">
            <span>{dateStr}</span>
            <span>{timeStr}</span>
          </div>
          <div className="nav-user" ref={menuRef}>
            <button className="user-btn" onClick={() => setMenuOpen((v) => !v)}>
              <FaUser size={28} color="#fff" />
            </button>
            {userName && (
              <span
                className="user-name"
                style={{
                  color: "#fff",
                  fontWeight: "bold",
                  whiteSpace: "nowrap",
                }}
              >
                {userName}
              </span>
            )}
            {menuOpen && (
              <div className="user-menu">
                <button onClick={handleConfig}>Configuración</button>
                <button onClick={handleLogout}>Cerrar sesión</button>
              </div>
            )}
            {showLogoutConfirm && (
              <div className="modal-overlay" style={{ zIndex: 2000 }}>
                <div
                  className="modal-content"
                  style={{
                    maxWidth: 340,
                    padding: "2rem 1.5rem",
                    textAlign: "center",
                  }}
                >
                  <h2
                    style={{
                      color: "#a30015",
                      fontWeight: 800,
                      fontSize: "1.15rem",
                      marginBottom: 18,
                    }}
                  >
                    ¿Cerrar sesión?
                  </h2>
                  <p
                    style={{
                      color: "#7b1531",
                      marginBottom: 22,
                      fontWeight: 600,
                    }}
                  >
                    ¿Estás seguro de que deseas cerrar sesión?
                  </p>
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      justifyContent: "center",
                    }}
                  >
                    <button
                      className="delete-btn"
                      style={{ minWidth: 90 }}
                      onClick={confirmLogout}
                    >
                      Cerrar sesión
                    </button>
                    <button
                      className="cancel-btn"
                      style={{ minWidth: 90 }}
                      onClick={cancelLogout}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div
        style={{
          padding: 24,
          paddingTop: "calc(var(--navbar-offset) + 2px)",
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        <div className="top-actions">
          <button className="open-add-modal-btn" onClick={openAddModal}>
            <FaPlus style={{ marginRight: 8 }} /> Nueva Cotización
          </button>
        </div>
        {/* Mensajes de error globales (fuera de modales) */}
        {errorMsg && !modalOpen && !detailsOpen && !reportOpen && (
          <div
            style={{
              background: "#ffe5e9",
              color: "#a30015",
              padding: "0.75rem 1rem",
              border: "1px solid #a30015",
              borderRadius: 8,
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span>{errorMsg}</span>
            {errorMsg.includes("Sesión inválida") && (
              <button
                type="button"
                onClick={() => navigate("/")}
                style={{
                  background: "#a30015",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 12px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Ir al login
              </button>
            )}
          </div>
        )}
        {/* Barra de filtros (estilo igual al de Usuarios) */}
        <div
          className="users-table-filter-row"
          style={{ margin: 0, marginBottom: 10 }}
        >
          <div className="users-filter-title">Filtrar por:</div>
          <select
            className="users-table-filter-select"
            value={cotFilterField}
            onChange={(e) => {
              const v = e.target.value;
              setCotFilterField(v);
              setCotFilterText("");
              setDateStart("");
              setDateEnd("");
            }}
          >
            <option value="cliente">Cliente</option>
            <option value="vendedor">Vendedor</option>
            <option value="estado">Estado</option>
            <option value="id">ID</option>
            <option value="fecha">Fecha</option>
          </select>
          {cotFilterField === "estado" ? (
            <select
              className="users-table-filter-input"
              value={cotFilterText}
              onChange={(e) => setCotFilterText(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="pagado">Pagado</option>
              <option value="cancelado">Cancelado</option>
              <option value="en_proceso">En proceso</option>
              <option value="fabricado">Fabricado</option>
              <option value="espera_material">En espera de material</option>
              <option value="entregado">Entregado</option>
            </select>
          ) : cotFilterField === "fecha" ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="date"
                className="users-table-filter-input"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
              />
              <span style={{ alignSelf: "center", color: "#555" }}>a</span>
              <input
                type="date"
                className="users-table-filter-input"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
              />
            </div>
          ) : (
            <input
              className="users-table-filter-input"
              placeholder="Escribe para filtrar…"
              value={cotFilterText}
              onChange={(e) => setCotFilterText(e.target.value)}
            />
          )}
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span className="users-filter-title" style={{ marginLeft: 6 }}>
              Orden:
            </span>
            <select
              className="users-table-filter-select"
              value={cotOrder}
              onChange={(e) => setCotOrder(e.target.value)}
            >
              <option value="recientes">Más recientes</option>
              <option value="antiguos">Más antiguos</option>
            </select>
          </div>
          <button
            type="button"
            className="users-filter-clear-btn"
            onClick={() => {
              setCotFilterText("");
              setDateStart("");
              setDateEnd("");
              setCotOrder("recientes");
              setCotFilterField("cliente");
            }}
            title="Limpiar filtro"
          >
            <FaTimes /> Limpiar
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
          <button
            type="button"
            className="ventas-btn"
            onClick={() => setReportOpen(true)}
          >
            <FaUser style={{ marginRight: 6 }} />
            Reporte por Cliente
          </button>
          <button
            type="button"
            className="ventas-btn"
            onClick={() => setGlobalReportOpen(true)}
            style={{ background: "#7b1531" }}
          >
            <FaChartBar style={{ marginRight: 6 }} />
            Reporte Global por Fechas
          </button>
        </div>
        {/* Cotizaciones */}
        <section className="cotizaciones-section">
          <div style={{ overflowX: "auto" }}>
            <table className="cotizaciones-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th>Fecha</th>
                  <th>Anticipo</th>
                  <th>% Ant.</th>
                  <th>Total</th>
                  <th>Resto</th>
                  <th>Pago</th>
                  <th>Abonos</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9">Cargando...</td>
                  </tr>
                ) : cotizaciones.length === 0 ? (
                  <tr>
                    <td colSpan="9">No hay cotizaciones registradas</td>
                  </tr>
                ) : (
                  // Filtrar y ordenar cotizaciones
                  cotizaciones
                    .filter((cot) => {
                      const clienteNombre = (
                        cot.Cliente?.nombre ||
                        cot.cliente?.nombre ||
                        ""
                      ).toLowerCase();
                      const vendedorNombre = (
                        cot.Usuario?.nombre ||
                        cot.usuario?.nombre ||
                        ""
                      ).toLowerCase();
                      const estado = (cot.status || "").toLowerCase();
                      const idStr = String(cot.ID || cot.id || "");
                      const q = (cotFilterText || "").toLowerCase().trim();

                      // Filtro por fecha (rango)
                      if (cotFilterField === "fecha") {
                        if (!dateStart && !dateEnd) return true;
                        const t = new Date(
                          cot.fecha_creacion || cot.createdAt || cot.fecha || 0
                        ).getTime();
                        if (!t) return false;
                        const start = dateStart
                          ? new Date(`${dateStart}T00:00:00`).getTime()
                          : null;
                        const end = dateEnd
                          ? new Date(`${dateEnd}T23:59:59`).getTime()
                          : null;
                        if (start && end) return t >= start && t <= end;
                        if (start && !end) return t >= start;
                        if (!start && end) return t <= end;
                        return true;
                      }

                      // Filtros por texto/estado/id
                      if (!q) return true;
                      switch (cotFilterField) {
                        case "cliente":
                          return clienteNombre.includes(q);
                        case "vendedor":
                          return vendedorNombre.includes(q);
                        case "estado":
                          return estado.includes(q);
                        case "id":
                          return idStr.includes(q);
                        default:
                          return true;
                      }
                    })
                    .sort((a, b) => {
                      const ta = new Date(
                        a.fecha_creacion || a.createdAt || a.fecha || 0
                      ).getTime();
                      const tb = new Date(
                        b.fecha_creacion || b.createdAt || b.fecha || 0
                      ).getTime();
                      if (cotOrder === "antiguos") return ta - tb;
                      return tb - ta; // recientes primero
                    })
                    .map((cot) => {
                      const cliente = cot.Cliente || cot.cliente || {};
                      const usuario = cot.Usuario || cot.usuario || {};
                      const fecha = cot.fecha_creacion
                        ? new Date(cot.fecha_creacion).toLocaleDateString()
                        : "";
                      const anticipo = Number(cot.anticipo || 0);
                      const total = Number(cot.total || 0);
                      const resto = (total - anticipo).toFixed(2);
                      const pctAnt = total > 0 ? (anticipo / total) * 100 : 0;
                      // Badge pago
                      let pagoBadge = "No pagado";
                      let pagoColor = "#c0392b";
                      if (anticipo >= total && total > 0) {
                        pagoBadge = "Liquidado";
                        pagoColor = "#2ecc71";
                      } else if (pctAnt >= 70) {
                        pagoBadge = "≥70%";
                        pagoColor = "#27ae60";
                      } else if (anticipo > 0) {
                        pagoBadge = "Parcial";
                        pagoColor = "#f39c12";
                      }
                      const abonosCount = cot.abonos_count || 0;
                      const ultimoAbonoFecha = cot.ultimo_abono_fecha
                        ? new Date(cot.ultimo_abono_fecha).toLocaleDateString()
                        : "-";
                      const ultimoAbonoMonto =
                        cot.ultimo_abono_monto != null
                          ? Number(cot.ultimo_abono_monto).toFixed(2)
                          : null;
                      const rawStatus = (cot.status || "").toLowerCase();
                      const statusClass = `status-badge status-${rawStatus}`;
                      return (
                        <tr key={cot.ID || cot.id}>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                              }}
                            >
                              <strong>
                                {cot.nombre || cot.titulo || "(sin título)"}
                              </strong>
                              <small style={{ color: "#666" }}>
                                Cotización #{cot.ID || cot.id}
                              </small>
                            </div>
                          </td>
                          <td>{cliente.nombre || "-"}</td>
                          <td>{usuario.nombre || "-"}</td>
                          <td>{fecha}</td>
                          <td>${anticipo.toFixed(2)}</td>
                          <td>{pctAnt.toFixed(1)}%</td>
                          <td>${total.toFixed(2)}</td>
                          <td>${resto}</td>
                          <td>
                            <span
                              style={{
                                background: pagoColor,
                                color: "#fff",
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: ".7rem",
                              }}
                            >
                              {pagoBadge}
                            </span>
                          </td>
                          <td>
                            {abonosCount === 0 ? (
                              "0"
                            ) : (
                              <span
                                title={`Último: ${ultimoAbonoFecha}${
                                  ultimoAbonoMonto
                                    ? ` • $${ultimoAbonoMonto}`
                                    : ""
                                }`}
                              >
                                {abonosCount}
                              </span>
                            )}
                          </td>
                          <td>
                            {cot.status ? (
                              <span className={statusClass}>
                                {renderStatus(cot.status)}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td>
                            <div className="table-actions">
                              {/* Mostrar botón de venta si NO está pagado al 100% aunque esté fabricado o entregado */}
                              {Number(cot.anticipo || 0) < Number(cot.total || 0) ? (
                                <>
                                  <button
                                    className="edit-btn"
                                    title="Editar"
                                    onClick={() => openEditModal(cot)}
                                  >
                                    <FaEdit />
                                  </button>
                                  <button
                                    className="delete-btn"
                                    title="Cancelar"
                                    onClick={() => {
                                      setDeleteTarget(cot);
                                      setShowDeleteConfirm(true);
                                    }}
                                  >
                                    <FaTrash />
                                  </button>
                                  <button
                                    className="ventas-btn"
                                    title="Ver detalles"
                                    onClick={() => openDetails(cot)}
                                  >
                                    <FaEye /> Detalles
                                  </button>
                                  <button
                                    className="ventas-btn"
                                    title="Abonar / Confirmar venta"
                                    onClick={() => openConfirmVenta(cot)}
                                  >
                                    Venta
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="edit-btn"
                                    title="Editar"
                                    onClick={() => openEditModal(cot)}
                                  >
                                    <FaEdit />
                                  </button>
                                  <button
                                    className="ventas-btn"
                                    title="Ver detalles"
                                    onClick={() => openDetails(cot)}
                                  >
                                    <FaEye />
                                  </button>
                                  <button
                                    className="duplicate-btn"
                                    title="Duplicar cotización"
                                    onClick={() => handleDuplicar(cot)}
                                  >
                                    <FaCopy /> Dup.
                                  </button>
                                </>
                              )}
                              <button
                                className="pdf-btn"
                                title="Generar PDF"
                                onClick={() => handleGenerarPDF(cot.ID || cot.id)}
                              >
                                <FaFilePdf /> PDF
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reporte avanzado de ventas */}
        {reportOpen && (
          <div
            className="modal-overlay"
            onClick={() => setReportOpen(false)}
            style={{ zIndex: 2000 }}
          >
            <div
              className="modal-content"
              style={{ 
                width: 900, 
                maxWidth: "90vw", 
                maxHeight: "90vh",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                position: "relative"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* --- BEGIN: moved logic for filtering and summary --- */}
              {(() => {
                try {
                  // Filtrar cotizaciones según criterios
                  let filteredCotizaciones = [...cotizaciones];
                  // Filtro por cliente (nombre)
                  if (reportFilters.cliente && reportFilters.cliente !== 'all') {
                    filteredCotizaciones = filteredCotizaciones.filter(cot => {
                      const nombre = cot.Cliente?.nombre || cot.cliente?.nombre || "Desconocido";
                      return nombre === reportFilters.cliente;
                    });
                  }
                  // Filtro por estado
                  if (reportFilters.estado && reportFilters.estado !== 'all') {
                    filteredCotizaciones = filteredCotizaciones.filter(cot => (cot.status || '').toLowerCase() === reportFilters.estado);
                  }
                  // Filtro por fecha inicio
                  if (reportFilters.fechaInicio) {
                    const fechaInicio = new Date(reportFilters.fechaInicio);
                    filteredCotizaciones = filteredCotizaciones.filter(cot => {
                      const fechaCot = new Date(cot.fecha_creacion || cot.createdAt);
                      return fechaCot >= fechaInicio;
                    });
                  }
                  // Filtro por fecha fin
                  if (reportFilters.fechaFin) {
                    const fechaFin = new Date(reportFilters.fechaFin);
                    fechaFin.setHours(23, 59, 59, 999);
                    filteredCotizaciones = filteredCotizaciones.filter(cot => {
                      const fechaCot = new Date(cot.fecha_creacion || cot.createdAt);
                      return fechaCot <= fechaFin;
                    });
                  }
                  const rows = new Map();
                  for (const cot of filteredCotizaciones) {
                    const cliente = cot.Cliente || cot.cliente || {};
                    const key = cliente.ID || cliente.id || cliente.nombre || "Desconocido";
                    const nombre = cliente.nombre || "Desconocido";
                    const total = Number(cot.total || 0);
                    const anticipo = Number(cot.anticipo || 0);
                    const saldo = total - anticipo;
                    const estado = (cot.status || "").toLowerCase();
                    const prev = rows.get(key) || {
                      nombre,
                      pedidos: 0,
                      total: 0,
                      anticipo: 0,
                      saldo: 0,
                      pedidosPendientes: 0,
                      pedidosPagados: 0,
                      pedidosEnProceso: 0,
                      pedidosCancelados: 0,
                      ultimaVenta: null
                    };
                    prev.pedidos += 1;
                    prev.total += total;
                    prev.anticipo += anticipo;
                    prev.saldo += saldo;
                    // Conteo por estado
                    if (estado === "pendiente") prev.pedidosPendientes += 1;
                    else if (estado === "pagado") prev.pedidosPagados += 1;
                    else if (estado === "cancelado") prev.pedidosCancelados += 1;
                    else if (["en_proceso", "fabricado", "entregado", "espera_material"].includes(estado)) prev.pedidosEnProceso += 1;
                    // Última venta
                    const fechaVenta = new Date(cot.fecha_creacion || cot.createdAt);
                    if (!prev.ultimaVenta || fechaVenta > new Date(prev.ultimaVenta)) {
                      prev.ultimaVenta = cot.fecha_creacion || cot.createdAt;
                    }
                    rows.set(key, prev);
                  }
                  const arr = Array.from(rows.values()).sort((a, b) => b.total - a.total);
                  // Siempre renderizar filtros y métricas, aunque arr.length === 0
                  const totales = arr.reduce(
                    (acc, r) => ({
                      pedidos: acc.pedidos + r.pedidos,
                      total: acc.total + r.total,
                      anticipo: acc.anticipo + r.anticipo,
                      saldo: acc.saldo + r.saldo,
                      pedidosPendientes: acc.pedidosPendientes + r.pedidosPendientes,
                      pedidosPagados: acc.pedidosPagados + r.pedidosPagados,
                      pedidosEnProceso: acc.pedidosEnProceso + r.pedidosEnProceso,
                      pedidosCancelados: acc.pedidosCancelados + r.pedidosCancelados
                    }),
                    { pedidos: 0, total: 0, anticipo: 0, saldo: 0, pedidosPendientes: 0, pedidosPagados: 0, pedidosEnProceso: 0, pedidosCancelados: 0 }
                  );
                  const promedioVentasPorCliente = arr.length > 0 ? (totales.total / arr.length) : 0;
                  const clientesConSaldo = arr.filter(r => r.saldo > 0).length;
                  const clientesLiquidados = arr.filter(r => r.saldo <= 0).length;
                  return (
                    <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                      {/* Filtros visuales tipo reporte global */}
                      <div style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        padding: "1rem",
                        width: "100%",
                        marginBottom: "1rem",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "1rem",
                        alignItems: "end"
                      }}>
                        <div style={{ minWidth: 180 }}>
                          <label style={{ fontWeight: 600, color: "#374151", fontSize: "0.95rem", marginBottom: 4, display: 'block' }}>Cliente:</label>
                          <select
                            value={reportFilters.cliente || 'all'}
                            onChange={e => setReportFilters({ ...reportFilters, cliente: e.target.value })}
                            style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #ccc', fontSize: '1rem' }}
                          >
                            <option value="all">Todos</option>
                            {[...new Set(cotizaciones.map(cot => (cot.Cliente?.nombre || cot.cliente?.nombre || "Desconocido")))].map(nombre => (
                              <option key={nombre} value={nombre}>{nombre}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ minWidth: 180 }}>
                          <label style={{ fontWeight: 600, color: "#374151", fontSize: "0.95rem", marginBottom: 4, display: 'block' }}>Estado:</label>
                          <select
                            value={reportFilters.estado || 'all'}
                            onChange={e => setReportFilters({ ...reportFilters, estado: e.target.value })}
                            style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #ccc', fontSize: '1rem' }}
                          >
                            <option value="all">Todos</option>
                            <option value="pendiente">Pendiente</option>
                            <option value="pagado">Pagado</option>
                            <option value="cancelado">Cancelado</option>
                            <option value="en_proceso">En proceso</option>
                            <option value="fabricado">Fabricado</option>
                            <option value="espera_material">En espera de material</option>
                            <option value="entregado">Entregado</option>
                          </select>
                        </div>
                        <div style={{ minWidth: 180 }}>
                          <label style={{ fontWeight: 600, color: "#374151", fontSize: "0.95rem", marginBottom: 4, display: 'block' }}>Fecha inicio:</label>
                          <input
                            type="date"
                            value={reportFilters.fechaInicio || ''}
                            onChange={e => setReportFilters({ ...reportFilters, fechaInicio: e.target.value })}
                            style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #ccc', fontSize: '1rem' }}
                          />
                        </div>
                        <div style={{ minWidth: 180 }}>
                          <label style={{ fontWeight: 600, color: "#374151", fontSize: "0.95rem", marginBottom: 4, display: 'block' }}>Fecha fin:</label>
                          <input
                            type="date"
                            value={reportFilters.fechaFin || ''}
                            onChange={e => setReportFilters({ ...reportFilters, fechaFin: e.target.value })}
                            style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #ccc', fontSize: '1rem' }}
                          />
                        </div>
                      </div>
                      {/* Métricas destacadas */}
                      <div style={{ 
                        display: "grid", 
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", 
                        gap: "0.75rem", 
                        marginBottom: "1rem" 
                      }}>
                        <div style={{ 
                          background: "linear-gradient(135deg, #a30015, #7b1531)",
                          padding: "0.75rem", 
                          borderRadius: "6px", 
                          border: "2px solid #a30015",
                          textAlign: "center",
                          boxShadow: "0 2px 6px rgba(163, 0, 21, 0.1)"
                        }}>
                          <div style={{ color: "#fff", fontSize: "1.8rem", fontWeight: "700" }}>
                            {arr.length}
                          </div>
                          <div style={{ color: "#fff", fontSize: "0.9rem", fontWeight: "600" }}>
                            Clientes Activos
                          </div>
                        </div>
                        <div style={{ 
                          background: "linear-gradient(135deg, #7b1531, #a30015)",
                          padding: "0.75rem", 
                          borderRadius: "6px", 
                          border: "2px solid #7b1531",
                          textAlign: "center",
                          boxShadow: "0 2px 6px rgba(123, 21, 49, 0.1)"
                        }}>
                          <div style={{ color: "#fff", fontSize: "1.8rem", fontWeight: "700" }}>
                            ${promedioVentasPorCliente.toFixed(0)}
                          </div>
                          <div style={{ color: "#fff", fontSize: "0.9rem", fontWeight: "600" }}>
                            Promedio por Cliente
                          </div>
                        </div>
                        <div style={{ 
                          background: "linear-gradient(135deg, #d4a574, #b8860b)",
                          padding: "0.75rem", 
                          borderRadius: "6px", 
                          border: "2px solid #d4a574",
                          textAlign: "center",
                          boxShadow: "0 2px 6px rgba(212, 165, 116, 0.1)"
                        }}>
                          <div style={{ color: "#fff", fontSize: "1.8rem", fontWeight: "700" }}>
                            {clientesConSaldo}
                          </div>
                          <div style={{ color: "#fff", fontSize: "0.9rem", fontWeight: "600" }}>
                            Con Saldo Pendiente
                          </div>
                        </div>
                        <div style={{ 
                          background: "linear-gradient(135deg, #2d7a2d, #90ee90)",
                          padding: "0.75rem", 
                          borderRadius: "6px", 
                          border: "2px solid #2d7a2d",
                          textAlign: "center",
                          boxShadow: "0 2px 6px rgba(45, 122, 45, 0.1)"
                        }}>
                          <div style={{ color: "#fff", fontSize: "1.8rem", fontWeight: "700" }}>
                            {clientesLiquidados}
                          </div>
                          <div style={{ color: "#fff", fontSize: "0.9rem", fontWeight: "600" }}>
                            Totalmente Liquidados
                          </div>
                        </div>
                      </div>
                      {/* Tabla de datos o mensaje de sin datos */}
                      <div style={{ flex: 1, overflowY: "auto", border: "1px solid #e9ecef", borderRadius: "6px" }}>
                        {arr.length === 0 ? (
                          <div style={{ 
                            textAlign: "center", 
                            padding: "4rem 2rem",
                            color: "#6b7280",
                            background: "#f9fafb",
                            borderRadius: "8px",
                            border: "2px dashed #d1d5db"
                          }}>
                            <FaChartBar size={48} style={{ marginBottom: "1rem", opacity: 0.4 }} />
                            <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.25rem", fontWeight: "600" }}>Sin datos disponibles</h3>
                            <p style={{ margin: 0, fontSize: "1rem" }}>No hay ventas que coincidan con los filtros seleccionados</p>
                          </div>
                        ) : (
                          <table className="ventas-table" style={{ minWidth: 800, margin: 0 }}>
                            <thead style={{ background: "linear-gradient(135deg, #a30015, #7b1531)", color: "white", position: "sticky", top: 0, zIndex: 1 }}>
                              <tr>
                                <th style={{ textAlign: "left", padding: "1rem 0.75rem", color: "#111", fontWeight: "600" }}>Cliente</th>
                                <th style={{ textAlign: "center", padding: "1rem 0.75rem", color: "#111", fontWeight: "600" }}>
                                  <FaList size={14} style={{ marginRight: "0.25rem" }} />
                                  Total Pedidos
                                </th>
                                <th style={{ textAlign: "center", padding: "1rem 0.75rem", color: "#111", fontWeight: "600" }}>
                                  <div>Pendientes</div>
                                  <div style={{ fontSize: "0.7rem", color: "#a30015" }}>En Proceso</div>
                                </th>
                                <th style={{ textAlign: "right", padding: "1rem 0.75rem", color: "#111", fontWeight: "600" }}>
                                  <FaMoneyCheckAlt size={14} style={{ marginRight: "0.25rem" }} />
                                  Total Ventas
                                </th>
                                <th style={{ textAlign: "right", padding: "1rem 0.75rem", color: "#111", fontWeight: "600" }}>Anticipos Pagados</th>
                                <th style={{ textAlign: "right", padding: "1rem 0.75rem", color: "#111", fontWeight: "600" }}>Saldo Pendiente</th>
                                <th style={{ textAlign: "center", padding: "1rem 0.75rem", color: "#111", fontWeight: "600" }}>% Pagado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {arr.map((r, index) => {
                                const porcentajePagado = r.total > 0 ? ((r.anticipo / r.total) * 100) : 0;
                                const isLiquidado = r.saldo <= 0 && r.total > 0;
                                return (
                                  <tr 
                                    key={r.nombre}
                                    style={{ 
                                      background: index % 2 === 0 ? "#fff" : "#f8f9fa",
                                      borderBottom: "1px solid #e9ecef"
                                    }}
                                  >
                                    <td style={{ padding: "0.75rem", fontWeight: "600" }}>
                                      <div style={{ display: "flex", alignItems: "center" }}>
                                        <FaUser size={12} style={{ marginRight: "0.5rem", color: "#a30015" }} />
                                        {r.nombre}
                                      </div>
                                    </td>
                                    <td style={{ textAlign: "center", padding: "0.75rem" }}>
                                      <span style={{ 
                                        background: "#e3f2fd", 
                                        color: "#1976d2", 
                                        padding: "0.25rem 0.5rem", 
                                        borderRadius: "12px",
                                        fontSize: "0.85rem",
                                        fontWeight: "600"
                                      }}>
                                        {r.pedidos}
                                      </span>
                                    </td>
                                    <td style={{ textAlign: "center", padding: "0.75rem" }}>
                                      <div style={{ fontSize: "0.85rem" }}>
                                        <span style={{ 
                                          color: "#ffc107", 
                                          fontWeight: "600",
                                          display: "block"
                                        }}>
                                          {r.pedidosPendientes}
                                        </span>
                                        <span style={{ 
                                          color: "#28a745", 
                                          fontWeight: "600"
                                        }}>
                                          {r.pedidosEnProceso}
                                        </span>
                                      </div>
                                    </td>
                                    <td style={{ textAlign: "right", padding: "0.75rem", fontWeight: "700" }}>
                                      ${r.total.toLocaleString('es', {minimumFractionDigits: 2})}
                                    </td>
                                    <td style={{ textAlign: "right", padding: "0.75rem", color: "#28a745", fontWeight: "600" }}>
                                      ${r.anticipo.toLocaleString('es', {minimumFractionDigits: 2})}
                                    </td>
                                    <td style={{ 
                                      textAlign: "right", 
                                      padding: "0.75rem", 
                                      color: r.saldo > 0 ? "#dc3545" : "#28a745",
                                      fontWeight: "600"
                                    }}>
                                      ${r.saldo.toLocaleString('es', {minimumFractionDigits: 2})}
                                    </td>
                                    <td style={{ textAlign: "center", padding: "0.75rem" }}>
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <div style={{ 
                                          width: "40px", 
                                          height: "8px", 
                                          background: "#e9ecef", 
                                          borderRadius: "4px", 
                                          overflow: "hidden",
                                          marginRight: "0.5rem"
                                        }}>
                                          <div style={{ 
                                            width: `${Math.min(porcentajePagado, 100)}%`, 
                                            height: "100%", 
                                            background: isLiquidado ? "#28a745" : porcentajePagado >= 70 ? "#ffc107" : "#dc3545",
                                            transition: "width 0.3s ease"
                                          }} />
                                        </div>
                                        <span style={{ 
                                          fontSize: "0.8rem", 
                                          fontWeight: "600",
                                          color: isLiquidado ? "#28a745" : porcentajePagado >= 70 ? "#ffc107" : "#dc3545"
                                        }}>
                                          {porcentajePagado.toFixed(0)}%
                                        </span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                      {/* Fila de totales */}
                      <div style={{ 
                        background: "linear-gradient(135deg, #a30015, #7b1531)", 
                        padding: "1rem", 
                        borderRadius: "8px", 
                        marginTop: "1rem",
                        border: "2px solid #a30015",
                        color: "white"
                      }}>
                        <div style={{ 
                          display: "grid", 
                          gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", 
                          gap: "1rem", 
                          alignItems: "center",
                          fontWeight: "700"
                        }}>
                          <div style={{ color: "white", fontSize: "1.1rem" }}>
                            TOTALES CONSOLIDADOS
                          </div>
                          <div style={{ textAlign: "center", color: "white" }}>
                            {totales.pedidos} pedidos
                          </div>
                          <div style={{ textAlign: "center", fontSize: "0.9rem" }}>
                            <div style={{ color: "#ffeb99" }}>{totales.pedidosPendientes} pend.</div>
                            <div style={{ color: "#90ee90" }}>{totales.pedidosEnProceso} proc.</div>
                          </div>
                          <div style={{ textAlign: "right", color: "white" }}>
                            ${totales.total.toLocaleString('es', {minimumFractionDigits: 2})}
                          </div>
                          <div style={{ textAlign: "right", color: "#90ee90" }}>
                            ${totales.anticipo.toLocaleString('es', {minimumFractionDigits: 2})}
                          </div>
                          <div style={{ textAlign: "right", color: totales.saldo > 0 ? "#ffb3b3" : "#90ee90" }}>
                            ${totales.saldo.toLocaleString('es', {minimumFractionDigits: 2})}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                } catch (err) {
                  console.error('Error en el modal de reporte avanzado:', err);
                  return (
                    <div style={{ color: '#a30015', padding: 32, textAlign: 'center', fontWeight: 700 }}>
                      Ocurrió un error al mostrar el reporte avanzado.<br />
                      Por favor revisa los filtros o contacta al administrador.<br />
                      <button className="cancel-btn" style={{ marginTop: 24 }} onClick={() => setReportOpen(false)}>
                        Cerrar
                      </button>
                    </div>
                  );
                }
              })()}
              
              <div className="modal-btn-row no-print" style={{ marginTop: "1.5rem", justifyContent: "space-between" }}>
                <div>
                  {/* botón de imprimir removido por solicitud */}
                  
                  <button
                    className="ventas-btn"
                    onClick={() => {
                      // Generar CSV simple de los datos
                      const rows = new Map();
                      for (const cot of cotizaciones) {
                        const cliente = cot.Cliente || cot.cliente || {};
                        const key = cliente.ID || cliente.id || cliente.nombre || "Desconocido";
                        const nombre = cliente.nombre || "Desconocido";
                        const total = Number(cot.total || 0);
                        const anticipo = Number(cot.anticipo || 0);
                        const saldo = total - anticipo;
                        
                        const prev = rows.get(key) || {
                          nombre,
                          pedidos: 0,
                          total: 0,
                          anticipo: 0,
                          saldo: 0,
                        };
                        
                        prev.pedidos += 1;
                        prev.total += total;
                        prev.anticipo += anticipo;
                        prev.saldo += saldo;
                        rows.set(key, prev);
                      }
                      
                      const arr = Array.from(rows.values()).sort((a, b) => b.total - a.total);
                      let csv = "Cliente,Pedidos,Total Ventas,Anticipos,Saldo Pendiente,Porcentaje Pagado\n";
                      
                      arr.forEach(r => {
                        const porcentaje = r.total > 0 ? ((r.anticipo / r.total) * 100).toFixed(1) : "0";
                        csv += `"${r.nombre}",${r.pedidos},${r.total.toFixed(2)},${r.anticipo.toFixed(2)},${r.saldo.toFixed(2)},${porcentaje}%\n`;
                      });
                      
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const link = document.createElement("a");
                      const url = URL.createObjectURL(blob);
                      link.setAttribute("href", url);
                      link.setAttribute("download", `reporte_clientes_${new Date().toISOString().split('T')[0]}.csv`);
                      link.style.visibility = 'hidden';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    style={{ marginLeft: "0.5rem" }}
                  >
                    <FaFilePdf style={{ marginRight: "0.5rem" }} />
                    Exportar CSV
                  </button>
                </div>
                
                <button
                  className="cancel-btn"
                  onClick={() => setReportOpen(false)}
                >
                  <FaTimes style={{ marginRight: "0.5rem" }} />
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Reporte Global por Fechas */}
        {globalReportOpen && (
          <div className="modal-overlay" onClick={() => setGlobalReportOpen(false)}>
            <div
              className="modal-content"
              style={{ 
                width: 900, 
                maxWidth: "90vw", 
                maxHeight: "90vh",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                position: "relative"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Botón X en esquina superior derecha */}
              <button
                className="modal-close-btn no-print"
                onClick={() => setGlobalReportOpen(false)}
                style={{
                  position: "absolute",
                  top: "10px",
                  right: "10px",
                  width: "32px",
                  height: "32px",
                  border: "none",
                  background: "#dc3545",
                  color: "white",
                  borderRadius: "50%",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  fontWeight: "bold",
                  zIndex: 1000,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                  transition: "all 0.2s ease"
                }}
                onMouseOver={(e) => {
                  e.target.style.background = "#c82333";
                  e.target.style.transform = "scale(1.1)";
                }}
                onMouseOut={(e) => {
                  e.target.style.background = "#dc3545";
                  e.target.style.transform = "scale(1)";
                }}
              >
                ✕
              </button>

              {/* Contenido oculto solo para impresión del reporte global */}
              <div className="print-content" style={{ display: "none" }}>
                <div className="print-title">REPORTE GLOBAL DE VENTAS</div>
                <div className="print-date">
                  {new Date().toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })} - {new Date().toLocaleTimeString('es-MX', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </div>
                
                <div className="filtros-aplicados">
                  <strong>Período:</strong>
                  {globalFilters.fechaInicio ? ` Desde: ${globalFilters.fechaInicio}` : ' Sin fecha inicio'}
                  {globalFilters.fechaFin ? ` | Hasta: ${globalFilters.fechaFin}` : ' | Sin fecha fin'}
                  {globalFilters.estados.length > 0 && ` | Estados: ${globalFilters.estados.join(', ')}`}
                </div>

                {(() => {
                  // Lógica de filtrado para impresión (duplicada para global)
                  let filteredCotizaciones = [...cotizaciones];
                  
                  if (globalFilters.fechaInicio) {
                    const fechaInicio = new Date(globalFilters.fechaInicio);
                    filteredCotizaciones = filteredCotizaciones.filter(cot => {
                      const fechaCot = new Date(cot.fecha_creacion || cot.createdAt);
                      return fechaCot >= fechaInicio;
                    });
                  }
                  
                  if (globalFilters.fechaFin) {
                    const fechaFin = new Date(globalFilters.fechaFin);
                    fechaFin.setHours(23, 59, 59, 999);
                    filteredCotizaciones = filteredCotizaciones.filter(cot => {
                      const fechaCot = new Date(cot.fecha_creacion || cot.createdAt);
                      return fechaCot <= fechaFin;
                    });
                  }
                  
                  if (globalFilters.estados.length > 0) {
                    filteredCotizaciones = filteredCotizaciones.filter(cot => 
                      globalFilters.estados.includes(cot.status)
                    );
                  }

                  // Crear resumen por cliente
                  const rows = new Map();
                  for (const cot of filteredCotizaciones) {
                    const cliente = cot.Cliente || cot.cliente || {};
                    const key = cliente.ID || cliente.id || cliente.nombre || "Desconocido";
                    const nombre = cliente.nombre || "Desconocido";
                    const total = Number(cot.total || 0);
                    const anticipo = Number(cot.anticipo || 0);
                    const saldo = total - anticipo;
                    
                    const prev = rows.get(key) || {
                      nombre,
                      pedidos: 0,
                      total: 0,
                      anticipo: 0,
                      saldo: 0
                    };
                    
                    prev.pedidos += 1;
                    prev.total += total;
                    prev.anticipo += anticipo;
                    prev.saldo += saldo;
                    rows.set(key, prev);
                  }
                  
                  const arr = Array.from(rows.values()).sort((a, b) => b.total - a.total);
                  
                  if (arr.length === 0) {
                    return (
                      <div style={{ textAlign: "center", padding: "2rem" }}>
                        <h3>Sin datos disponibles</h3>
                        <p>No hay ventas en el período seleccionado</p>
                      </div>
                    );
                  }
                  
                  const totales = arr.reduce(
                    (acc, r) => ({
                      pedidos: acc.pedidos + r.pedidos,
                      total: acc.total + r.total,
                      anticipo: acc.anticipo + r.anticipo,
                      saldo: acc.saldo + r.saldo
                    }),
                    { pedidos: 0, total: 0, anticipo: 0, saldo: 0 }
                  );

                  return (
                    <div>
                      {/* Métricas para impresión */}
                      <div className="metricas-print">
                        <div className="metrica-item">
                          <div className="metrica-valor">{arr.length}</div>
                          <div className="metrica-label">Clientes</div>
                        </div>
                        <div className="metrica-item">
                          <div className="metrica-valor">{totales.pedidos}</div>
                          <div className="metrica-label">Total Pedidos</div>
                        </div>
                        <div className="metrica-item">
                          <div className="metrica-valor">${totales.total.toFixed(0)}</div>
                          <div className="metrica-label">Ventas Totales</div>
                        </div>
                        <div className="metrica-item">
                          <div className="metrica-valor">${totales.saldo.toFixed(0)}</div>
                          <div className="metrica-label">Saldo Pendiente</div>
                        </div>
                      </div>

                      {/* Tabla para impresión */}
                      <table className="ventas-table">
                        <thead>
                          <tr>
                            <th>Cliente</th>
                            <th>Pedidos</th>
                            <th>Total Ventas</th>
                            <th>Anticipos</th>
                            <th>Saldo Pendiente</th>
                            <th>% Pagado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {arr.map((r, index) => {
                            const porcentajePagado = r.total > 0 ? ((r.anticipo / r.total) * 100) : 0;
                            
                            return (
                              <tr key={r.nombre}>
                                <td style={{ textAlign: "left" }}>{r.nombre}</td>
                                <td>{r.pedidos}</td>
                                <td style={{ textAlign: "right" }}>
                                  ${r.total.toLocaleString('es', {minimumFractionDigits: 2})}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  ${r.anticipo.toLocaleString('es', {minimumFractionDigits: 2})}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  ${r.saldo.toLocaleString('es', {minimumFractionDigits: 2})}
                                </td>
                                <td>{porcentajePagado.toFixed(0)}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Totales para impresión */}
                      <div className="totales-print">
                        <div className="totales-grid">
                          <div><strong>TOTALES CONSOLIDADOS</strong></div>
                          <div>{totales.pedidos} pedidos</div>
                          <div>${totales.total.toLocaleString('es', {minimumFractionDigits: 2})}</div>
                          <div>${totales.anticipo.toLocaleString('es', {minimumFractionDigits: 2})}</div>
                          <div>${totales.saldo.toLocaleString('es', {minimumFractionDigits: 2})}</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              {/* Fin del contenido de impresión del reporte global */}

              {/* Header del reporte */}
              <div style={{ 
                background: "linear-gradient(135deg, #7b1531, #a30015)", 
                color: "white", 
                padding: "1.5rem", 
                borderRadius: "8px", 
                marginBottom: "1.5rem",
                marginTop: "40px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
              }} className="no-print">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: "700", display: "flex", alignItems: "center", color: "white" }}>
                      <FaChartBar style={{ marginRight: "0.5rem" }} />
                      Reporte Global de Ventas
                    </h2>
                    <p style={{ margin: "0.3rem 0 0", opacity: 1, fontSize: "0.9rem", color: "white" }}>
                      Análisis consolidado por período
                    </p>
                  </div>
                  {/* acción de imprimir removida por solicitud */}
                </div>
              </div>

              {/* Panel de filtros globales */}
              <div style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                padding: "1rem",
                marginBottom: "1rem"
              }} className="no-print">
                <h3 style={{ 
                  margin: "0 0 0.75rem 0", 
                  fontSize: "1rem", 
                  fontWeight: "600", 
                  color: "#374151",
                  display: "flex",
                  alignItems: "center"
                }}>
                  <FaFilter style={{ marginRight: "0.4rem" }} />
                  Filtros por Período
                </h3>
                
                <div style={{ 
                  display: "grid", 
                  gridTemplateColumns: "1fr 1fr 2fr", 
                  gap: "1rem",
                  alignItems: "end"
                }}>
                  <div>
                    <label style={{ 
                      display: "block", 
                      fontSize: "0.875rem", 
                      fontWeight: "600", 
                      color: "#374151", 
                      marginBottom: "0.5rem" 
                    }}>
                      <FaCalendarAlt style={{ marginRight: "0.25rem" }} />
                      Fecha Inicio:
                    </label>
                    <input
                      type="date"
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        border: "1px solid #d1d5db",
                        borderRadius: "6px",
                        fontSize: "0.875rem",
                        color: "#374151",
                        background: "white"
                      }}
                      value={globalFilters.fechaInicio}
                      onChange={(e) => setGlobalFilters({...globalFilters, fechaInicio: e.target.value})}
                    />
                  </div>

                  <div>
                    <label style={{ 
                      display: "block", 
                      fontSize: "0.875rem", 
                      fontWeight: "600", 
                      color: "#374151", 
                      marginBottom: "0.5rem" 
                    }}>
                      <FaCalendarAlt style={{ marginRight: "0.25rem" }} />
                      Fecha Fin:
                    </label>
                    <input
                      type="date"
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        border: "1px solid #d1d5db",
                        borderRadius: "6px",
                        fontSize: "0.875rem",
                        color: "#374151",
                        background: "white"
                      }}
                      value={globalFilters.fechaFin}
                      onChange={(e) => setGlobalFilters({...globalFilters, fechaFin: e.target.value})}
                    />
                  </div>

                  <div style={{ 
                    display: "flex", 
                    flexWrap: "wrap", 
                    gap: "0.5rem",
                    alignItems: "center"
                  }}>
                    {['pendiente', 'pagado', 'en_proceso', 'fabricado', 'entregado'].map(estado => (
                      <label key={estado} style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        padding: "0.25rem 0.5rem",
                        background: globalFilters.estados.includes(estado) ? "#dbeafe" : "white",
                        border: "1px solid #d1d5db",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        fontWeight: "500",
                        color: "#374151"
                      }}>
                        <input
                          type="checkbox"
                          checked={globalFilters.estados.includes(estado)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setGlobalFilters({
                                ...globalFilters,
                                estados: [...globalFilters.estados, estado]
                              });
                            } else {
                              setGlobalFilters({
                                ...globalFilters,
                                estados: globalFilters.estados.filter(s => s !== estado)
                              });
                            }
                          }}
                          style={{ margin: 0, accentColor: "#7b1531" }}
                        />
                        {renderStatus(estado)}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {(() => {
                // Filtrar cotizaciones por período global
                let filteredCotizaciones = [...cotizaciones];
                
                if (globalFilters.fechaInicio) {
                  const fechaInicio = new Date(globalFilters.fechaInicio);
                  filteredCotizaciones = filteredCotizaciones.filter(cot => {
                    const fechaCot = new Date(cot.fecha_creacion || cot.createdAt);
                    return fechaCot >= fechaInicio;
                  });
                }
                
                if (globalFilters.fechaFin) {
                  const fechaFin = new Date(globalFilters.fechaFin);
                  fechaFin.setHours(23, 59, 59, 999);
                  filteredCotizaciones = filteredCotizaciones.filter(cot => {
                    const fechaCot = new Date(cot.fecha_creacion || cot.createdAt);
                    return fechaCot <= fechaFin;
                  });
                }
                
                if (globalFilters.estados.length > 0) {
                  filteredCotizaciones = filteredCotizaciones.filter(cot => 
                    globalFilters.estados.includes(cot.status)
                  );
                }

                // Crear resumen por cliente
                const rows = new Map();
                for (const cot of filteredCotizaciones) {
                  const cliente = cot.Cliente || cot.cliente || {};
                  const key = cliente.ID || cliente.id || cliente.nombre || "Desconocido";
                  const nombre = cliente.nombre || "Desconocido";
                  const total = Number(cot.total || 0);
                  const anticipo = Number(cot.anticipo || 0);
                  const saldo = total - anticipo;
                  
                  const prev = rows.get(key) || {
                    nombre,
                    pedidos: 0,
                    total: 0,
                    anticipo: 0,
                    saldo: 0
                  };
                  
                  prev.pedidos += 1;
                  prev.total += total;
                  prev.anticipo += anticipo;
                  prev.saldo += saldo;
                  rows.set(key, prev);
                }
                
                const arr = Array.from(rows.values()).sort((a, b) => b.total - a.total);
                
                if (arr.length === 0) {
                  return (
                    <div style={{ 
                      textAlign: "center", 
                      padding: "4rem 2rem",
                      color: "#6b7280"
                    }}>
                      <FaChartBar size={48} style={{ marginBottom: "1rem", opacity: 0.4 }} />
                      <h3>Sin datos disponibles</h3>
                      <p>No hay ventas en el período seleccionado</p>
                    </div>
                  );
                }
                
                const totales = arr.reduce(
                  (acc, r) => ({
                    pedidos: acc.pedidos + r.pedidos,
                    total: acc.total + r.total,
                    anticipo: acc.anticipo + r.anticipo,
                    saldo: acc.saldo + r.saldo
                  }),
                  { pedidos: 0, total: 0, anticipo: 0, saldo: 0 }
                );

                return (
                  <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    {/* Métricas */}
                    <div className="metricas-print" style={{ 
                      display: "grid", 
                      gridTemplateColumns: "repeat(4, 1fr)", 
                      gap: "0.75rem", 
                      marginBottom: "1rem"
                    }}>
                      <div className="metrica-item" style={{ 
                        background: "#ffffff", 
                        padding: "0.75rem", 
                        borderRadius: "6px", 
                        border: "2px solid #7b1531",
                        textAlign: "center"
                      }}>
                        <div className="metrica-valor" style={{ color: "#7b1531", fontSize: "1.8rem", fontWeight: "700" }}>
                          {arr.length}
                        </div>
                        <div className="metrica-label" style={{ color: "#333", fontSize: "0.9rem", fontWeight: "600" }}>
                          Clientes
                        </div>
                      </div>
                      
                      <div className="metrica-item" style={{ 
                        background: "#ffffff", 
                        padding: "0.75rem", 
                        borderRadius: "6px", 
                        border: "2px solid #28a745",
                        textAlign: "center"
                      }}>
                        <div className="metrica-valor" style={{ color: "#28a745", fontSize: "1.8rem", fontWeight: "700" }}>
                          {totales.pedidos}
                        </div>
                        <div className="metrica-label" style={{ color: "#333", fontSize: "0.9rem", fontWeight: "600" }}>
                          Total Pedidos
                        </div>
                      </div>
                      
                      <div className="metrica-item" style={{ 
                        background: "#ffffff", 
                        padding: "0.75rem", 
                        borderRadius: "6px", 
                        border: "2px solid #17a2b8",
                        textAlign: "center"
                      }}>
                        <div className="metrica-valor" style={{ color: "#17a2b8", fontSize: "1.8rem", fontWeight: "700" }}>
                          ${totales.total.toFixed(0)}
                        </div>
                        <div className="metrica-label" style={{ color: "#333", fontSize: "0.9rem", fontWeight: "600" }}>
                          Ventas Totales
                        </div>
                      </div>
                      
                      <div className="metrica-item" style={{ 
                        background: "#ffffff", 
                        padding: "0.75rem", 
                        borderRadius: "6px", 
                        border: "2px solid #ffc107",
                        textAlign: "center"
                      }}>
                        <div className="metrica-valor" style={{ color: "#e68900", fontSize: "1.8rem", fontWeight: "700" }}>
                          ${totales.saldo.toFixed(0)}
                        </div>
                        <div className="metrica-label" style={{ color: "#333", fontSize: "0.9rem", fontWeight: "600" }}>
                          Saldo Pendiente
                        </div>
                      </div>
                    </div>

                    {/* Tabla compacta para impresión */}
                    <div style={{ flex: 1, overflowY: "auto" }}>
                      <table className="ventas-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead style={{ background: "linear-gradient(135deg, #7b1531, #a30015)", color: "white", position: "sticky", top: 0 }}>
                          <tr>
                            <th style={{ padding: "0.75rem 0.5rem", textAlign: "left", color: "white", fontWeight: "600" }}>Cliente</th>
                            <th style={{ padding: "0.75rem 0.5rem", textAlign: "center", color: "white", fontWeight: "600" }}>Pedidos</th>
                            <th style={{ padding: "0.75rem 0.5rem", textAlign: "right", color: "white", fontWeight: "600" }}>Total Ventas</th>
                            <th style={{ padding: "0.75rem 0.5rem", textAlign: "right", color: "white", fontWeight: "600" }}>Anticipos</th>
                            <th style={{ padding: "0.75rem 0.5rem", textAlign: "right", color: "white", fontWeight: "600" }}>Saldo Pendiente</th>
                            <th style={{ padding: "0.75rem 0.5rem", textAlign: "center", color: "white", fontWeight: "600" }}>% Pagado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {arr.map((r, index) => {
                            const porcentajePagado = r.total > 0 ? ((r.anticipo / r.total) * 100) : 0;
                            
                            return (
                              <tr 
                                key={r.nombre}
                                style={{ 
                                  background: index % 2 === 0 ? "#fff" : "#f8f9fa",
                                  borderBottom: "1px solid #e9ecef"
                                }}
                              >
                                <td style={{ padding: "0.5rem", fontWeight: "600" }}>
                                  {r.nombre}
                                </td>
                                <td style={{ textAlign: "center", padding: "0.5rem" }}>
                                  <span style={{ 
                                    background: "#e3f2fd", 
                                    color: "#1976d2", 
                                    padding: "0.2rem 0.4rem", 
                                    borderRadius: "10px",
                                    fontSize: "0.8rem",
                                    fontWeight: "600"
                                  }}>
                                    {r.pedidos}
                                  </span>
                                </td>
                                <td style={{ textAlign: "right", padding: "0.5rem", fontWeight: "700" }}>
                                  ${r.total.toLocaleString('es', {minimumFractionDigits: 2})}
                                </td>
                                <td style={{ textAlign: "right", padding: "0.5rem", color: "#28a745", fontWeight: "600" }}>
                                  ${r.anticipo.toLocaleString('es', {minimumFractionDigits: 2})}
                                </td>
                                <td style={{ 
                                  textAlign: "right", 
                                  padding: "0.5rem", 
                                  color: r.saldo > 0 ? "#dc3545" : "#28a745",
                                  fontWeight: "600"
                                }}>
                                  ${r.saldo.toLocaleString('es', {minimumFractionDigits: 2})}
                                </td>
                                <td style={{ textAlign: "center", padding: "0.5rem" }}>
                                  <span style={{ 
                                    fontSize: "0.8rem", 
                                    fontWeight: "600",
                                    color: porcentajePagado >= 100 ? "#28a745" : porcentajePagado >= 70 ? "#ffc107" : "#dc3545"
                                  }}>
                                    {porcentajePagado.toFixed(0)}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Totales */}
                    <div className="totales-print" style={{ 
                      background: "linear-gradient(135deg, #7b1531, #a30015)", 
                      padding: "1rem", 
                      borderRadius: "8px", 
                      marginTop: "1rem",
                      color: "white"
                    }}>
                      <div style={{ 
                        display: "grid", 
                        gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", 
                        gap: "1rem", 
                        alignItems: "center",
                        fontWeight: "700"
                      }}>
                        <div style={{ color: "white", fontSize: "1.1rem" }}>
                          TOTALES CONSOLIDADOS
                        </div>
                        <div style={{ textAlign: "center", color: "white" }}>
                          {totales.pedidos} pedidos
                        </div>
                        <div style={{ textAlign: "right", color: "white" }}>
                          ${totales.total.toLocaleString('es', {minimumFractionDigits: 2})}
                        </div>
                        <div style={{ textAlign: "right", color: "#90ee90" }}>
                          ${totales.anticipo.toLocaleString('es', {minimumFractionDigits: 2})}
                        </div>
                        <div style={{ textAlign: "right", color: totales.saldo > 0 ? "#ffb3b3" : "#90ee90" }}>
                          ${totales.saldo.toLocaleString('es', {minimumFractionDigits: 2})}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
              
              <div className="modal-btn-row no-print" style={{ marginTop: "1.5rem", justifyContent: "space-between" }}>
                {/* botón de imprimir removido por solicitud */}
                
                <button
                  className="cancel-btn"
                  onClick={() => setGlobalReportOpen(false)}
                >
                  <FaTimes style={{ marginRight: "0.5rem" }} />
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de confirmación de venta */}
        {modalOpen === "confirmVenta" && ventaResumen && (
          <div className="modal-overlay">
            <div
              className="modal-content"
              style={{
                width: 560,
                maxWidth: "95vw",
                maxHeight: "80vh",
                overflowY: "auto",
                color: "#222",
                position: "relative",
              }}
            >
              <div className="modal-close-row">
                <button
                  className="modal-close-btn"
                  title="Cancelar"
                  aria-label="Cancelar"
                  onClick={() => setModalOpen(null)}
                >
                  {/* X dibujada por CSS */}
                </button>
              </div>
              <h2
                style={{ fontSize: "1.15rem", marginBottom: 12, color: "#111" }}
              >
                Confirmar venta — Cotización #{ventaResumen.ID}
              </h2>
              {(() => {
                const total = Number(ventaResumen.total || 0);
                const anticipo = Number(ventaResumen.anticipo || 0);
                const saldo = total - anticipo;
                const pct = total > 0 ? (anticipo / total) * 100 : 0;
                const clienteNombre =
                  clientes.find((c) => c.ID === ventaResumen.ID_cliente)
                    ?.nombre || "-";
                const barraColor =
                  pct >= 100
                    ? "#2ecc71"
                    : pct >= 70
                    ? "#27ae60"
                    : pct > 0
                    ? "#f39c12"
                    : "#c0392b";
                return (
                  <div
                    style={{
                      marginBottom: 14,
                      display: "grid",
                      gap: 12,
                      gridTemplateColumns: "1fr 1fr",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ fontSize: ".85rem" }}>
                        <strong>Cliente:</strong> {clienteNombre}
                      </div>
                      <div style={{ fontSize: ".85rem" }}>
                        <strong>Vendedor:</strong>{" "}
                        {ventaResumen.vendedor || "-"}
                      </div>
                      <div style={{ fontSize: ".85rem" }}>
                        <strong>Importe total:</strong> ${total.toFixed(2)}
                      </div>
                      <div style={{ fontSize: ".85rem" }}>
                        <strong>Anticipo:</strong> ${anticipo.toFixed(2)} (
                        {pct.toFixed(1)}%)
                      </div>
                      <div style={{ fontSize: ".85rem" }}>
                        <strong>Saldo:</strong> ${saldo.toFixed(2)}
                      </div>
                      {pct < 70 && total > 0 && (
                        <div
                          style={{
                            background: "#fff8e1",
                            border: "1px solid #ffe58f",
                            color: "#874d00",
                            padding: "6px 8px",
                            borderRadius: 6,
                            fontSize: ".75rem",
                          }}
                        >
                          Falta para 70%:{" "}
                          <strong>
                            ${(total * 0.7 - anticipo).toFixed(2)}
                          </strong>
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div style={{ fontSize: ".75rem", fontWeight: 600 }}>
                        Progreso de pago
                      </div>
                      <div
                        style={{
                          height: 16,
                          background: "#ecf0f1",
                          borderRadius: 10,
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, pct).toFixed(2)}%`,
                            background: barraColor,
                            height: "100%",
                            transition: "width .3s",
                          }}
                        />
                        <span
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: ".7rem",
                            fontWeight: 700,
                            color: pct > 15 ? "#fff" : "#2c3e50",
                          }}
                        >
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ fontSize: ".75rem", fontWeight: 600 }}>
                        Productos
                      </div>
                      <div
                        style={{
                          background: "#f7f9fa",
                          border: "1px solid #dde3e6",
                          borderRadius: 6,
                          padding: "6px 8px",
                          maxHeight: 120,
                          overflowY: "auto",
                          fontSize: ".7rem",
                        }}
                      >
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {(ventaResumen.productos || []).map((p, i) => {
                            const prod = productos.find(
                              (pr) => pr.ID === p.productoId
                            );
                            const tipoMedida = getLineaTipoMedida(p);
                            const unidadLabel =
                              tipoMedida === "piezas" ? "piezas" : "m²";
                            return (
                              <li key={i} style={{ marginBottom: 2 }}>
                                {prod?.nombre || ""} • {p.cantidad} {unidadLabel}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {(() => {
                const total = Number(ventaResumen.total || 0);
                const anticipo = Number(ventaResumen.anticipo || 0);
                const pct = total > 0 ? (anticipo / total) * 100 : 0;
                const esPagado = (ventaResumen.status || '').toLowerCase() === 'pagado';
                if (pct >= 70) {
                  return (
                    <>
                      <div
                        style={{
                          background: "#ecf9f1",
                          border: "1px solid #b7e4cd",
                          color: "#25694b",
                          padding: "6px 10px",
                          borderRadius: 6,
                          marginBottom: 12,
                          fontSize: ".7rem",
                        }}
                      >
                        Umbral alcanzado: ya puedes confirmar la venta.
                      </div>
                      {/* Botón para cambiar estado a pagado si el anticipo cubre el total pero el estado no es pagado */}
                      {total > 0 && anticipo >= total && !esPagado && (
                        <button
                          className="ventas-btn"
                          style={{ marginBottom: 12, fontSize: ".9rem", padding: "7px 16px" }}
                          onClick={async () => {
                            try {
                              const id = ventaResumen.ID || ventaResumen.id;
                              const res = await fetchWithAuth(
                                `${API_COTIZACIONES}/${id}/status`,
                                null,
                                {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ status: "pagado" })
                                }
                              );
                              if (!res.ok) throw new Error("No se pudo cambiar el estado");
                              setVentaResumen((prev) => ({ ...prev, status: "pagado" }));
                              setModalInfo("El estado ha sido cambiado a <b>pagado</b> correctamente.");
                              setTimeout(() => setModalInfo(null), 3500);
                            } catch (e) {
                              setModalInfo(`<span style='color:#a30015'>${e.message || "Error al cambiar estado"}</span>`);
                              setTimeout(() => setModalInfo(null), 3500);
                            }
                          }}
                        >
                          Cambiar estado a pagado
                        </button>
                      )}
                    </>
                  );
                }
                const sugerido = total * 0.7;
                const falta = Math.max(0, sugerido - anticipo);
                return (
                  <div
                    style={{
                      background: "#fffdf5",
                      border: "1px solid #f5e2b8",
                      color: "#7a5c21",
                      padding: "8px 10px",
                      borderRadius: 6,
                      marginBottom: 12,
                      fontSize: ".7rem",
                    }}
                  >
                    Aún no alcanza el umbral del 70% para confirmar la venta.
                    Falta <strong>${falta.toFixed(2)}</strong>. Puedes seguir
                    abonando cualquier monto y cuando llegues al 70% el botón
                    Confirmar se habilitará.
                  </div>
                );
              })()}
              {Number(ventaResumen.anticipo || 0) <
                Number(ventaResumen.total || 0) && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <label style={{ display: "block", fontWeight: 600 }}>
                      Monto a abonar
                    </label>
                    <input
                      className="user-input"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={confirmAbono}
                      onChange={(e) => setConfirmAbono(e.target.value)}
                    />
                  </div>
                  {(() => {
                    const total = Number(ventaResumen.total || 0);
                    const anticipo = Number(ventaResumen.anticipo || 0);
                    const falta70 = Math.max(0, total * 0.7 - anticipo);
                    const saldoTotal = Math.max(0, total - anticipo);
                    if (saldoTotal <= 0) return null;
                    return (
                      <div
                        style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
                      >
                        {falta70 > 0 && (
                          <button
                            type="button"
                            className="ventas-btn"
                            onClick={() => {
                              setConfirmAbono(falta70.toFixed(2));
                              setConfirmObs(
                                `Abono para alcanzar 70% (faltaban $${falta70.toFixed(
                                  2
                                )})`
                              );
                            }}
                          >
                            Abonar hasta 70% (${falta70.toFixed(2)})
                          </button>
                        )}
                        <button
                          type="button"
                          className="add-btn"
                          onClick={() => {
                            setConfirmAbono(saldoTotal.toFixed(2));
                            setConfirmObs(
                              `Liquidación de saldo ($${saldoTotal.toFixed(2)})`
                            );
                          }}
                        >
                          Liquidar saldo (${saldoTotal.toFixed(2)})
                        </button>
                      </div>
                    );
                  })()}
                  <div>
                    <label style={{ display: "block", fontWeight: 600 }}>
                      Observaciones (opcional)
                    </label>
                    <textarea
                      className="user-input"
                      rows={2}
                      value={confirmObs}
                      onChange={(e) => setConfirmObs(e.target.value)}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      justifyContent: "stretch",
                    }}
                  >
                    <button
                      className="add-btn"
                      style={{ flexBasis: "100%", fontSize: "1rem" }}
                      disabled={confirmLoading}
                      onClick={handleAgregarAnticipo}
                    >
                      {confirmLoading ? "Guardando…" : "Agregar anticipo"}
                    </button>
                  </div>
                  {(() => {
                    // Mostrar resumen histórico rápido si está en ventaResumen
                    const historial = ventaResumen.historialAnticipos || [];
                    if (!Array.isArray(historial) || historial.length === 0)
                      return null;
                    const totalAbonos = historial.reduce(
                      (acc, h) => acc + Number(h.monto || 0),
                      0
                    );
                    return (
                      <div
                        style={{
                          background: "#f7f9fa",
                          border: "1px solid #dde3e6",
                          padding: "8px 10px",
                          borderRadius: 6,
                          fontSize: ".7rem",
                        }}
                      >
                        <strong>Historial de abonos:</strong>
                        <table
                          style={{
                            width: "100%",
                            fontSize: ".65rem",
                            marginTop: 6,
                          }}
                        >
                          <thead>
                            <tr style={{ textAlign: "left" }}>
                              <th style={{ padding: "2px 4px" }}>Fecha</th>
                              <th style={{ padding: "2px 4px" }}>Monto</th>
                              <th style={{ padding: "2px 4px" }}>Obs.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {historial
                              .slice(-5)
                              .reverse()
                              .map((h, i) => (
                                <tr key={i}>
                                  <td style={{ padding: "2px 4px" }}>
                                    {new Date(
                                      h.fecha ||
                                        h.createdAt ||
                                        h.updatedAt ||
                                        Date.now()
                                    ).toLocaleDateString()}
                                  </td>
                                  <td style={{ padding: "2px 4px" }}>
                                    ${Number(h.monto || 0).toFixed(2)}
                                  </td>
                                  <td style={{ padding: "2px 4px" }}>
                                    {h.observaciones?.slice(0, 20) || "-"}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td style={{ padding: "2px 4px" }}>Total</td>
                              <td style={{ padding: "2px 4px" }}>
                                ${totalAbonos.toFixed(2)}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              )}
              {errorMsg && (
                <div style={{ color: "#a30015", marginBottom: 8 }}>
                  {errorMsg}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginTop: 18,
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="cancel-btn"
                  style={{ flex: 1 }}
                  onClick={() => setModalOpen(null)}
                >
                  <FaTimes style={{ marginRight: 6 }} /> Cancelar
                </button>
                {Number(ventaResumen.anticipo || 0) <
                  Number(ventaResumen.total || 0) && (
                  <button
                    className="ventas-btn"
                    style={{ flex: 1 }}
                    title="Liquidar y confirmar"
                    onClick={() => handleConfirmVenta(true)}
                  >
                    <FaSave style={{ marginRight: 6 }} /> Liquidar y confirmar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal de crear/editar cotización */}
        {(modalOpen === "add" || modalOpen === "edit") && (
          <div className="modal-overlay" onClick={closeModal}>
            <div
              className="modal-content compact"
              style={{
                color: "#111",
                width: "90vw",
                maxWidth: 1200,
                maxHeight: "85vh",
                overflowY: "auto",
                position: "relative",
                display: "flex",
                flexDirection: "column",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header con título y botón cerrar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingBottom: 12,
                  borderBottom: "1px solid #e0e0e0",
                  marginBottom: 12,
                  position: "sticky",
                  top: 0,
                  background: "#fff",
                  zIndex: 10,
                }}
              >
                <h2 style={{ fontSize: "1.15rem", margin: 0, fontWeight: 700, color: "#7b1531" }}>
                  {modalOpen === "edit"
                    ? `Editar cotización #${editTarget?.ID || ""}`
                    : "Nueva cotización"}
                </h2>
                <button
                  className="modal-close-btn"
                  title="Cerrar"
                  aria-label="Cerrar"
                  onClick={closeModal}
                  style={{
                    position: "relative",
                    width: 32,
                    height: 32,
                    border: "none",
                    background: "#f5f5f5",
                    borderRadius: "50%",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.5rem",
                    color: "#a30015",
                    transition: "all 0.2s",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#e0e0e0")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "#f5f5f5")}
                >
                  ✕
                </button>
              </div>

              {errorMsg && (
                <div
                  style={{
                    background: "#ffe5e9",
                    color: "#a30015",
                    padding: "10px 12px",
                    borderRadius: 6,
                    marginBottom: 12,
                    fontSize: "0.9rem",
                    border: "1px solid #ffb3ba",
                  }}
                >
                  {errorMsg}
                </div>
              )}

              {modalInfo && (
                <div
                  style={{
                    background: "#e8f1ff",
                    color: "#1a4b8c",
                    padding: "10px 12px",
                    borderRadius: 6,
                    marginBottom: 12,
                    fontSize: "0.88rem",
                    border: "1px solid rgba(26, 75, 140, 0.25)",
                    fontWeight: 600,
                  }}
                >
                  {modalInfo}
                </div>
              )}
              {/* Advertencia si está entregado y no pagado al 100% */}
              {modalOpen === "edit" && form.status === "entregado" && Number(form.anticipo || 0) < Number(form.total || 0) && (
                <div
                  style={{
                    background: "#fff3cd",
                    color: "#856404",
                    padding: "10px 12px",
                    borderRadius: 6,
                    marginBottom: 12,
                    fontSize: "0.95rem",
                    border: "1px solid #ffeeba",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{fontSize: "1.2em", marginRight: 6}}>⚠️</span>
                  Esta cotización ya fue <b>entregada</b> pero <b>no está pagada al 100%</b>. Es necesario completar el pago.
                </div>
              )}

              <form
                onSubmit={modalOpen === "edit" ? handleEdit : handleAdd}
                className="user-form"
                style={{ flex: 1, display: "flex", flexDirection: "column" }}
              >
                {/* Sección 1: Información básica */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 1fr",
                    gap: 12,
                    marginBottom: 14,
                    padding: "12px",
                    background: "#f9f9f9",
                    borderRadius: 8,
                  }}
                >
                  <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#555" }}>
                      Título de cotización *
                    </label>
                    <input
                      className="user-input"
                      type="text"
                      placeholder="Ej. Proyecto cocina López"
                      value={form.nombre || ""}
                      onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                      style={{ marginTop: 4, fontSize: "0.9rem" }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#555" }}>
                      Cliente *
                    </label>
                    <select
                      className="user-input"
                      value={form.ID_cliente || ""}
                      onChange={(e) => setForm({ ...form, ID_cliente: Number(e.target.value) })}
                      style={{ marginTop: 4, fontSize: "0.9rem" }}
                      required
                    >
                      <option value="">Selecciona un cliente…</option>
                      {(clientes || []).filter(c => {
                        // Considera activo si status es true, 1, "activo" (cualquier mayúscula/minúscula)
                        if (typeof c.status === 'boolean') return c.status;
                        if (typeof c.status === 'number') return c.status === 1;
                        if (typeof c.status === 'string') return c.status.trim().toLowerCase() === 'activo';
                        return false;
                      }).map((c) => (
                        <option key={c.ID} value={c.ID}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#555" }}>
                      IVA
                    </label>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, incluir_iva: !form.incluir_iva })}
                      style={{
                        width: "100%",
                        marginTop: 4,
                        background: form.incluir_iva ? "#27ae60" : "#bdc3c7",
                        color: "#fff",
                        border: "none",
                        padding: "8px 10px",
                        borderRadius: 6,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        transition: "all 0.2s",
                      }}
                    >
                      {form.incluir_iva ? "IVA 16%" : "Sin IVA"}
                    </button>
                  </div>
                  <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#555" }}>
                      Estado *
                    </label>
                    <select
                      className="user-input"
                      value={form.status || "pendiente"}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      style={{ marginTop: 4, fontSize: "0.9rem" }}
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="pagado">Pagado</option>
                      <option value="cancelado">Cancelado</option>
                      <option value="en_proceso">En proceso</option>
                      <option value="fabricado">Fabricado</option>
                      <option value="espera_material">En espera de material</option>
                      <option value="entregado">Entregado</option>
                    </select>
                  </div>
                </div>

                {/* Sección 2: Productos */}
                <div style={{ marginBottom: 12, flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      alignItems: "flex-start",
                      marginBottom: 8,
                      paddingBottom: 8,
                      borderBottom: "2px solid #7b1531",
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#7b1531" }}>
                      Productos agregados
                    </h3>
                    {productosBloqueados && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          color: "#a05211",
                          background: "#fff1e6",
                          border: "1px solid rgba(160, 82, 17, 0.25)",
                          borderRadius: 999,
                          padding: "4px 10px",
                        }}
                      >
                        Bloqueado por estado no pendiente
                      </span>
                    )}
                    <button
                      type="button"
                      className="add-btn"
                      onClick={handleAddProducto}
                      disabled={productosBloqueados}
                      style={{
                        padding: "6px 10px",
                        fontSize: "0.85rem",
                        opacity: productosBloqueados ? 0.5 : 1,
                        cursor: productosBloqueados ? "not-allowed" : "pointer",
                      }}
                    >
                      <FaPlus style={{ marginRight: 4 }} /> Agregar
                    </button>
                  </div>

                  <div
                    className="products-list"
                    style={{
                      maxHeight: 280,
                      overflowY: "auto",
                      paddingRight: 8,
                    }}
                  >
                    {(form.productos || []).length === 0 ? (
                      <div
                        style={{
                          color: "#999",
                          fontSize: "0.85rem",
                          textAlign: "center",
                          padding: "20px 0",
                          background: "#f9f9f9",
                          borderRadius: 6,
                        }}
                      >
                        No hay productos. Haz clic en "Agregar" para comenzar.
                      </div>
                    ) : (
                      (form.productos || []).map((p, i) => {
                        const productoId = p.productoId || p.ID_producto;
                        const info = getProductoInfo(productoId);
                        const prodMatch = info.prod;
                        const unidadLinea = getLineaTipoMedida(p);
                        const unidadLabel = unidadLinea === "piezas" ? "piezas" : "m²";
                        const cantidadBase =
                          p.cantidad === "" || p.cantidad === null || p.cantidad === undefined
                            ? ""
                            : Number(p.cantidad);
                        const cantidadNumero =
                          typeof cantidadBase === "number" && !Number.isNaN(cantidadBase)
                            ? cantidadBase
                            : Number(cantidadBase);
                        const valueForInput =
                          cantidadBase === "" || Number.isNaN(cantidadNumero)
                            ? ""
                            : cantidadNumero;
                        const minValue = unidadLinea === "piezas" ? "1" : "0.01";
                        const stepValue = unidadLinea === "piezas" ? "1" : "0.01";
                        const stockLabel =
                          unidadLinea === "piezas"
                            ? typeof info.stockPiezas === "number" && Number.isFinite(info.stockPiezas)
                              ? `${info.stockPiezas.toLocaleString("es-MX")} pzs en stock`
                              : "Stock no disponible"
                            : typeof info.stockM2 === "number" && Number.isFinite(info.stockM2)
                            ? `${info.stockM2.toFixed(2)} m² en stock`
                            : "Stock no disponible";
                        const precioLabel =
                          typeof info.precio === "number" && info.precio > 0
                            ? `$${info.precio.toFixed(2)} por ${unidadLabel === "piezas" ? "pieza" : "m²"}`
                            : "Precio no definido";
                        const conversionLabel =
                          Number.isFinite(cantidadNumero) &&
                          cantidadNumero > 0 &&
                          typeof info.medidaPorUnidad === "number" &&
                          info.medidaPorUnidad > 0
                            ? unidadLinea === "piezas"
                              ? `≈ ${(cantidadNumero * info.medidaPorUnidad).toFixed(2)} m²`
                              : `≈ ${(cantidadNumero / info.medidaPorUnidad).toFixed(2)} pzs`
                            : null;

                        return (
                          <div
                            key={`prod-${i}`}
                            style={{
                              background: "#fff",
                              border: "1px solid #e0e0e0",
                              borderRadius: 6,
                              padding: "10px",
                              marginBottom: 8,
                              display: "grid",
                              gridTemplateColumns: "60px 1fr 1fr auto",
                              gap: 8,
                              alignItems: "flex-start",
                            }}
                          >
                            {prodMatch?.imagen && (
                              <div
                                style={{
                                  width: 60,
                                  height: 60,
                                  borderRadius: 4,
                                  overflow: "hidden",
                                  background: "#f0f0f0",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gridRow: "1 / 3",
                                }}
                              >
                                <img
                                  src={prodMatch.imagen}
                                  alt={prodMatch.nombre}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                  }}
                                />
                              </div>
                            )}
                            <div>
                              <label style={{ fontSize: "0.75rem", color: "#666" }}>Producto</label>
                              <select
                                id={`prod-${i}-productoId`}
                                className="user-input"
                                value={String(productoId || "")}
                                onChange={(e) =>
                                  handleProductoChange(i, "productoId", Number(e.target.value))
                                }
                                disabled={productosBloqueados}
                                style={{
                                  fontSize: "0.85rem",
                                  padding: "6px",
                                  backgroundColor: productosBloqueados ? "#f3f4f6" : undefined,
                                  cursor: productosBloqueados ? "not-allowed" : "pointer",
                                  opacity: productosBloqueados ? 0.8 : 1,
                                }}
                              >
                                <option value="">Seleccionar…</option>
                                {(productos || []).map((pr) => {
                                  const unidad = pr.unidadMedida || resolveUnidadMedidaProducto(pr);
                                  const esPiezas = unidad === "piezas";
                                  const stockValor = esPiezas
                                    ? Number(pr.cantidad_piezas ?? pr.stockPiezas ?? 0)
                                    : Number(pr.cantidad_m2 ?? 0);
                                  const stockDisponible = Number.isFinite(stockValor)
                                    ? esPiezas
                                      ? `${stockValor.toLocaleString("es-MX")} pzs`
                                      : `${stockValor.toFixed(2)} m²`
                                    : esPiezas
                                    ? "pzs sin dato"
                                    : "m² sin dato";
                                  return (
                                    <option key={pr.ID} value={String(pr.ID)}>
                                      {pr.nombre} ({stockDisponible})
                                    </option>
                                  );
                                })}
                              </select>
                              {prodMatch && (
                                <div
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "#666",
                                    marginTop: 6,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 2,
                                  }}
                                >
                                  <span>{precioLabel}</span>
                                  <span>{stockLabel}</span>
                                  {unidadLinea === "piezas" &&
                                    typeof info.medidaPorUnidad === "number" &&
                                    info.medidaPorUnidad > 0 && (
                                      <span>{`Equivalencia: ${info.medidaPorUnidad} m² por pieza`}</span>
                                    )}
                                </div>
                              )}
                            </div>
                            <div>
                              <label style={{ fontSize: "0.75rem", color: "#666" }}>
                                Cantidad ({unidadLabel})
                              </label>
                              <input
                                id={`prod-${i}-cantidad`}
                                className="user-input"
                                type="number"
                                min={minValue}
                                step={stepValue}
                                value={valueForInput}
                                onChange={(e) => handleProductoChange(i, "cantidad", e.target.value)}
                                disabled={productosBloqueados}
                                style={{
                                  fontSize: "0.85rem",
                                  padding: "6px",
                                  backgroundColor: productosBloqueados ? "#f3f4f6" : undefined,
                                  cursor: productosBloqueados ? "not-allowed" : "text",
                                }}
                              />
                              {conversionLabel && (
                                <div style={{ fontSize: "0.7rem", color: "#555", marginTop: 4 }}>
                                  {conversionLabel}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              className="delete-btn"
                              onClick={() => handleRemoveProducto(i)}
                              disabled={productosBloqueados}
                              style={{
                                padding: "6px 8px",
                                fontSize: "0.8rem",
                                alignSelf: "flex-start",
                                marginTop: "1.5rem",
                                opacity: productosBloqueados ? 0.5 : 1,
                                cursor: productosBloqueados ? "not-allowed" : "pointer",
                              }}
                            >
                              <FaTrash />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Sección 3: Totales y Anticipo */}
                {(() => {
                  const subtotal = calcularSubtotalLocal(form.productos);
                  const ivaVal = form.incluir_iva ? subtotal * 0.16 : 0;
                  const total = subtotal + ivaVal;
                  const sugerido = total * 0.7;
                  const pct = total > 0 ? (Number(form.anticipo || 0) / total) * 100 : 0;

                  return (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {/* Totales */}
                      <div style={{ padding: "12px", background: "#f0f7ff", borderRadius: 6 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: "0.85rem" }}>
                          <div>
                            <div style={{ color: "#666", fontWeight: 600 }}>Subtotal</div>
                            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#111" }}>
                              ${subtotal.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div style={{ color: "#666", fontWeight: 600 }}>
                              IVA {form.incluir_iva ? "16%" : "no aplicado"}
                            </div>
                            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#111" }}>
                              ${ivaVal.toFixed(2)}
                            </div>
                          </div>
                          <div style={{ gridColumn: "1 / -1", paddingTop: 8, borderTop: "1px solid #ddd" }}>
                            <div style={{ color: "#666", fontWeight: 600 }}>TOTAL</div>
                            <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#a30015" }}>
                              ${total.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Anticipo */}
                      <div style={{ padding: "12px", background: "#fff9e6", borderRadius: 6 }}>
                        <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#666", display: "block", marginBottom: 6 }}>
                          Anticipo *
                        </label>
                        <input
                          className="user-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.anticipo ?? 0}
                          onChange={(e) => setForm({ ...form, anticipo: Number(e.target.value) })}
                          style={{ fontSize: "0.9rem", marginBottom: 8 }}
                        />
                        <div style={{ marginBottom: 6 }}>
                          <div
                            style={{
                              height: 20,
                              background: "#ecf0f1",
                              borderRadius: 6,
                              overflow: "hidden",
                              position: "relative",
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(100, pct)}%`,
                                height: "100%",
                                background: pct >= 70 ? "#27ae60" : pct > 0 ? "#f39c12" : "#e74c3c",
                                transition: "width 0.3s",
                              }}
                            />
                            <span
                              style={{
                                position: "absolute",
                                inset: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                color: pct > 15 ? "#fff" : "#333",
                              }}
                            >
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() =>
                              setForm({ ...form, anticipo: Number(sugerido.toFixed(2)) })
                            }
                            style={{
                              flex: 1,
                              background: "#2980b9",
                              color: "#fff",
                              border: "none",
                              padding: "6px 10px",
                              borderRadius: 4,
                              cursor: "pointer",
                              fontSize: "0.8rem",
                              fontWeight: 600,
                            }}
                          >
                            70%
                          </button>
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, anticipo: 0 })}
                            style={{
                              flex: 1,
                              background: "#95a5a6",
                              color: "#fff",
                              border: "none",
                              padding: "6px 10px",
                              borderRadius: 4,
                              cursor: "pointer",
                              fontSize: "0.8rem",
                              fontWeight: 600,
                            }}
                          >
                            0
                          </button>
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, anticipo: total })}
                            style={{
                              flex: 1,
                              background: "#27ae60",
                              color: "#fff",
                              border: "none",
                              padding: "6px 10px",
                              borderRadius: 4,
                              cursor: "pointer",
                              fontSize: "0.8rem",
                              fontWeight: 600,
                            }}
                          >
                            100%
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Botones de acción */}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 14,
                    paddingTop: 12,
                    borderTop: "1px solid #e0e0e0",
                  }}
                >
                  <button type="submit" className="add-btn" style={{ flex: 1, padding: "10px" }}>
                    <FaSave style={{ marginRight: 6 }} />
                    {modalOpen === "edit" ? "Actualizar" : "Guardar cotización"}
                  </button>
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={closeModal}
                    style={{ flex: 1, padding: "10px" }}
                  >
                    <FaTimes style={{ marginRight: 6 }} /> Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de confirmación para cancelar cotización */}
        {showDeleteConfirm && (
          <div className="modal-overlay">
            <div
              className="modal-content"
              style={{
                width: 380,
                maxWidth: "90vw",
                color: "#222",
                position: "relative",
              }}
            >
              <div className="modal-close-row">
                <button
                  className="modal-close-btn"
                  title="Cancelar"
                  aria-label="Cancelar"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteTarget(null);
                  }}
                >
                  {/* X dibujada por CSS */}
                </button>
              </div>
              <h2
                style={{ color: "#111", fontSize: "1.05rem", marginBottom: 10 }}
              >
                Confirmar cancelación
              </h2>
              <p style={{ marginBottom: 16 }}>
                ¿Seguro que deseas cancelar la cotización #
                {deleteTarget?.ID || deleteTarget?.id}? Esta acción no se puede
                deshacer.
              </p>
              <div
                style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}
              >
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteTarget(null);
                  }}
                >
                  No, volver
                </button>
                <button
                  className="delete-btn"
                  onClick={() =>
                    deleteTarget &&
                    handleDelete(deleteTarget.ID || deleteTarget.id)
                  }
                >
                  Sí, cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de detalles de cotización */}
        {detailsOpen && (
          <div className="modal-overlay" onClick={() => setDetailsOpen(false)}>
            <div
              className="modal-content"
              style={{
                width: "80vw",
                maxWidth: 980,
                maxHeight: "82vh",
                overflowY: "auto",
                color: "#111",
                position: "relative",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-close-row">
                <button
                  className="modal-close-btn"
                  title="Cancelar"
                  aria-label="Cancelar"
                  onClick={() => setDetailsOpen(false)}
                >
                  {/* X dibujada por CSS */}
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <h2 style={{ fontSize: "1.2rem", marginBottom: 0 }}>
                  Detalles de la cotización
                </h2>
                {(() => {
                  const st = (
                    detailsData?.cotizacion?.status || ""
                  ).toLowerCase();
                  return !!detailsData?.cotizacion && st === "pendiente";
                })() && (
                  <button
                    className="add-btn"
                    onClick={() => {
                      const cot = detailsData.cotizacion;
                      setDetailsOpen(false);
                      openEditModal(cot);
                    }}
                    title="Editar esta cotización"
                  >
                    Editar esta cotización
                  </button>
                )}
              </div>
              {detailsLoading ? (
                <p>Cargando detalles…</p>
              ) : !detailsData ? (
                <p>No se encontraron detalles.</p>
              ) : (
                (() => {
                  const D = detailsData || {};
                  const cot = D.cotizacion || D; // backend devuelve { cotizacion, productos }
                  // Cliente con fallback a la lista si no viene anidado
                  const cliente =
                    cot.Cliente ||
                    cot.cliente ||
                    cot.customer ||
                    clientes.find(
                      (c) =>
                        c.ID ===
                        (cot.ID_cliente ||
                          cot.id_cliente ||
                          cot.clienteId ||
                          cot.customerId)
                    ) ||
                    {};
                  // Usuario/vendedor con fallback a un posible campo vendedor
                  const usuario =
                    cot.Usuario ||
                    cot.usuario || { nombre: cot.vendedor } ||
                    {};
                  const fechaRaw =
                    cot.fecha_creacion ||
                    cot.createdAt ||
                    cot.fecha ||
                    cot.fecha_venta ||
                    cot.fechaCotizacion;
                  const fecha = fechaRaw
                    ? new Date(fechaRaw).toLocaleString("es-MX")
                    : "";
                  const anticipo = Number(cot.anticipo ?? cot.advance ?? 0);
                  const total = Number(
                    cot.total ?? cot.importe ?? cot.monto ?? 0
                  );
                  const resto = (total - anticipo).toFixed(2);
                  const prods =
                    D.productos || D.items || cot.VentasProductos || [];
                  const anticiposHist = D.anticipos || [];
                  const anticiposMeta = D.anticipos_meta || null;
                  const telefono =
                    cliente?.telefono ||
                    cliente?.tel ||
                    cliente?.phone ||
                    cliente?.celular ||
                    "-";
                  const rfc =
                    cliente?.rfc || cliente?.RFC || cliente?.rfc_cliente || "-";
                  const statusText = (
                    (cot.status || cot.estado || cot.estatus || "") + ""
                  ).toString();
                  const direccion =
                    cliente?.direccion ||
                    [
                      cliente?.calle,
                      cliente?.colonia,
                      cliente?.ciudad,
                      cliente?.estado,
                      cliente?.cp,
                    ]
                      .filter(Boolean)
                      .join(", ");
                  const idVenta =
                    cot.ID ||
                    cot.id ||
                    cot.ID_venta ||
                    cot.ventaId ||
                    cot.cotizacionId ||
                    cot.folio ||
                    "";
                  // Badge si hubo ajuste en la última edición (flag local por ID)
                  const ajusteBadge = adjustFlags[idVenta];
                  return (
                    <div>
                      {ajusteBadge && (
                        <div
                          style={{
                            margin: "4px 0 8px",
                            display: "inline-block",
                            padding: "4px 10px",
                            borderRadius: 999,
                            background: "#006d32",
                            color: "#fff",
                            fontWeight: 700,
                            fontSize: ".85rem",
                          }}
                        >
                          Ajuste de inventario aplicado
                        </div>
                      )}
                      <div className="details-grid">
                        <div className="details-item">
                          <div className="details-label">Cotización</div>
                          <div className="details-value">#{idVenta || "-"}</div>
                        </div>
                        <div className="details-item">
                          <div className="details-label">Título</div>
                          <div className="details-value">
                            {cot.nombre || cot.titulo || "(sin título)"}
                          </div>
                        </div>
                        <div className="details-item">
                          <div className="details-label">Cliente</div>
                          <div className="details-value">
                            {cliente?.nombre || cliente?.name || "-"}
                          </div>
                        </div>
                        <div className="details-item">
                          <div className="details-label">Teléfono</div>
                          <div className="details-value">{telefono}</div>
                        </div>
                        <div className="details-item">
                          <div className="details-label">RFC</div>
                          <div className="details-value">{rfc}</div>
                        </div>
                        <div className="details-item">
                          <div className="details-label">Dirección</div>
                          <div className="details-value">
                            {direccion || "-"}
                          </div>
                        </div>
                        <div className="details-item">
                          <div className="details-label">Vendedor</div>
                          <div className="details-value">
                            {usuario?.nombre ||
                              usuario?.name ||
                              cot.vendedor ||
                              "-"}
                          </div>
                        </div>
                        <div className="details-item">
                          <div className="details-label">Fecha</div>
                          <div className="details-value">{fecha || "-"}</div>
                        </div>
                        <div className="details-item">
                          <div className="details-label">Estado</div>
                          <div className="details-value">
                            {statusText ? (
                              <span
                                className={`status-badge status-${statusText.toLowerCase()}`}
                              >
                                {renderStatus(statusText)}
                              </span>
                            ) : (
                              "-"
                            )}
                          </div>
                        </div>
                        <div className="details-item">
                          <div className="details-label">Anticipo</div>
                          <div className="details-value">
                            ${anticipo.toFixed(2)}
                          </div>
                        </div>
                        <div className="details-item">
                          <div className="details-label">Total</div>
                          <div className="details-value">
                            ${total.toFixed(2)}
                          </div>
                        </div>
                        <div className="details-item">
                          <div className="details-label">Resto</div>
                          <div className="details-value">${resto}</div>
                        </div>
                        <div className="details-item">
                          <div className="details-label">Subtotal</div>
                          <div className="details-value">
                            $
                            {(cot.subtotal || 0).toFixed
                              ? cot.subtotal.toFixed(2)
                              : Number(cot.subtotal || 0).toFixed(2)}
                          </div>
                        </div>
                        <div className="details-item">
                          <div className="details-label">IVA</div>
                          <div className="details-value">
                            $
                            {(cot.iva || 0).toFixed
                              ? cot.iva.toFixed(2)
                              : Number(cot.iva || 0).toFixed(2)}{" "}
                            {cot.incluir_iva ? "(aplicado)" : "(no aplicado)"}
                          </div>
                        </div>
                        <div className="details-item">
                          <div className="details-label">Progreso anticipo</div>
                          <div
                            className="details-value"
                            style={{ minWidth: 140 }}
                          >
                            {(() => {
                              const pct =
                                total > 0 ? (anticipo / total) * 100 : 0;
                              return (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 4,
                                  }}
                                >
                                  <div
                                    style={{
                                      height: 8,
                                      background: "#eee",
                                      borderRadius: 4,
                                      overflow: "hidden",
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: `${Math.min(100, pct).toFixed(
                                          2
                                        )}%`,
                                        background:
                                          pct >= 100
                                            ? "#006d32"
                                            : pct >= 70
                                            ? "#ff9800"
                                            : "#a30015",
                                        height: "100%",
                                      }}
                                    />
                                  </div>
                                  <span
                                    style={{
                                      fontSize: ".75rem",
                                      color: "#444",
                                    }}
                                  >
                                    {pct.toFixed(2)}%{" "}
                                    {pct >= 100
                                      ? "LIQUIDADO"
                                      : pct >= 70
                                      ? "MÍNIMO OK"
                                      : "FALTA ANTICIPO"}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                      <h3
                        style={{
                          marginTop: 12,
                          marginBottom: 8,
                          fontSize: "1.05rem",
                        }}
                      >
                        Productos
                      </h3>
                      {prods.length === 0 ? (
                        <p>Sin productos.</p>
                      ) : (
                        <div className="products-list">
                          {prods.map((p, i) => {
                            const prodMatch = productos.find(
                              (pr) =>
                                pr.ID ===
                                (p.productoId ||
                                  p.ID_producto ||
                                  p.idProducto ||
                                  p.productId)
                            );
                            const nombreProd =
                              p.Producto?.nombre ||
                              prodMatch?.nombre ||
                              p.nombre ||
                              "";
                            const imgUrl =
                              prodMatch?.imagen ||
                              prodMatch?.image ||
                              prodMatch?.img ||
                              prodMatch?.foto ||
                              prodMatch?.foto_url ||
                              p.imagen ||
                              null;
                            const medidas = p.medidas || p.tamano || "";
                            return (
                              <div
                                key={`${i}-${
                                  p.productoId || p.ID_producto || "prod"
                                }`}
                                className="product-card"
                              >
                                <div className="product-card-header">
                                  Producto {i + 1}
                                </div>
                                {imgUrl ? (
                                  <img
                                    src={imgUrl}
                                    alt={nombreProd || `Producto ${i + 1}`}
                                    className="product-thumb"
                                  />
                                ) : (
                                  <div className="product-thumb product-thumb--placeholder">
                                    Sin imagen
                                  </div>
                                )}
                                <div className="product-grid">
                                  <div className="product-field">
                                    <label>Producto</label>
                                    <div>{nombreProd}</div>
                                  </div>
                                  <div className="product-field">
                                    <label>Cantidad</label>
                                    <div>{p.cantidad ?? 1}</div>
                                  </div>
                                  <div className="product-field">
                                    <label>m²</label>
                                    <div>
                                      {(p.total_m2 ?? "").toString() || "-"}
                                    </div>
                                  </div>
                                  <div className="product-field">
                                    <label>Figura</label>
                                    <div>{p.tipoFigura || "-"}</div>
                                  </div>
                                  {p.tipoFigura === "circulo" && (
                                    <div className="product-field">
                                      <label>Radio</label>
                                      <div>{p.radio || "-"}</div>
                                    </div>
                                  )}
                                  {(p.tipoFigura === "ovalo" ||
                                    p.tipoFigura === "rectangulo" ||
                                    p.tipoFigura === "cuadrado" ||
                                    p.tipoFigura === "L" ||
                                    p.tipoFigura === "L invertida") && (
                                    <>
                                      {"base" in p && (
                                        <div className="product-field">
                                          <label>Base</label>
                                          <div>{p.base || "-"}</div>
                                        </div>
                                      )}
                                      {"altura" in p && (
                                        <div className="product-field">
                                          <label>Altura</label>
                                          <div>{p.altura || "-"}</div>
                                        </div>
                                      )}
                                    </>
                                  )}
                                  {("base2" in p || "altura2" in p) && (
                                    <>
                                      {"base2" in p && (
                                        <div className="product-field">
                                          <label>Base 2</label>
                                          <div>{p.base2 || "-"}</div>
                                        </div>
                                      )}
                                      {"altura2" in p && (
                                        <div className="product-field">
                                          <label>Altura 2</label>
                                          <div>{p.altura2 || "-"}</div>
                                        </div>
                                      )}
                                    </>
                                  )}
                                  {("soclo_base" in p ||
                                    "soclo_altura" in p) && (
                                    <>
                                      <div className="product-field">
                                        <label>Soclo Base</label>
                                        <div>{p.soclo_base || "-"}</div>
                                      </div>
                                      <div className="product-field">
                                        <label>Soclo Altura</label>
                                        <div>{p.soclo_altura || "-"}</div>
                                      </div>
                                    </>
                                  )}
                                  {("cubierta_base" in p ||
                                    "cubierta_altura" in p) && (
                                    <>
                                      <div className="product-field">
                                        <label>Cubierta Base</label>
                                        <div>{p.cubierta_base || "-"}</div>
                                      </div>
                                      <div className="product-field">
                                        <label>Cubierta Altura</label>
                                        <div>{p.cubierta_altura || "-"}</div>
                                      </div>
                                    </>
                                  )}
                                  {!!medidas && (
                                    <div className="product-field product-field--full">
                                      <label>Medidas</label>
                                      <div>{medidas}</div>
                                    </div>
                                  )}
                                  {("ancho" in p || "largo" in p) && (
                                    <>
                                      {"ancho" in p && (
                                        <div className="product-field">
                                          <label>Ancho</label>
                                          <div>{p.ancho || "-"}</div>
                                        </div>
                                      )}
                                      {"largo" in p && (
                                        <div className="product-field">
                                          <label>Largo</label>
                                          <div>{p.largo || "-"}</div>
                                        </div>
                                      )}
                                    </>
                                  )}
                                  {"descripcion" in p && (
                                    <div className="product-field product-field--full">
                                      <label>Descripción</label>
                                      <div>{p.descripcion || "-"}</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          marginTop: 14,
                        }}
                      >
                        <button
                          className="cancel-btn"
                          onClick={() => setDetailsOpen(false)}
                        >
                          Cerrar
                        </button>
                      </div>
                      {/* Historial de anticipos */}
                      <h3
                        style={{
                          marginTop: 22,
                          marginBottom: 8,
                          fontSize: "1.05rem",
                        }}
                      >
                        Historial de anticipos
                      </h3>
                      {anticiposHist.length === 0 ? (
                        <p>Sin anticipos registrados.</p>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table
                            className="residuos-table"
                            style={{ minWidth: 520 }}
                          >
                            <thead>
                              <tr>
                                <th>Fecha</th>
                                <th>Monto</th>
                                <th>Usuario</th>
                                <th>Observaciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {anticiposHist.map((a) => (
                                <tr key={a.id}>
                                  <td>
                                    {a.fecha
                                      ? new Date(a.fecha).toLocaleString(
                                          "es-MX"
                                        )
                                      : "-"}
                                  </td>
                                  <td>${Number(a.monto || 0).toFixed(2)}</td>
                                  <td>{a.usuario || "-"}</td>
                                  <td>{a.observaciones || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {anticiposMeta &&
                        (() => {
                          const total = Number(anticiposMeta.total_orden || 0);
                          const anticipoTot = Number(
                            anticiposMeta.anticipo_total || 0
                          );
                          const pct = total > 0 ? anticipoTot / total : 0;
                          let badgeText = "No pagado";
                          let badgeColor = "#c0392b";
                          if (anticipoTot >= total && total > 0) {
                            badgeText = "Liquidado";
                            badgeColor = "#2ecc71";
                          } else if (pct >= 0.7) {
                            badgeText = "Anticipo ≥ 70%";
                            badgeColor = "#27ae60";
                          } else if (anticipoTot > 0) {
                            badgeText = "Pago parcial";
                            badgeColor = "#f39c12";
                          }
                          return (
                            <div
                              style={{
                                marginTop: 10,
                                fontSize: ".85rem",
                                color: "#444",
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                flexWrap: "wrap",
                              }}
                            >
                              <div>
                                <strong>Anticipo total:</strong> $
                                {anticipoTot.toFixed(2)} |{" "}
                                <strong>Saldo pendiente:</strong> $
                                {anticiposMeta.saldo_pendiente} de $
                                {total.toFixed(2)}
                              </div>
                              <span
                                style={{
                                  background: badgeColor,
                                  color: "#fff",
                                  padding: "3px 8px",
                                  borderRadius: 6,
                                  fontSize: ".8rem",
                                }}
                              >
                                {badgeText}
                              </span>
                            </div>
                          );
                        })()}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}

        {/* Modal de resumen de confirmación de inventario */}
        {confirmSummaryOpen && (
          <div
            className="modal-overlay"
            onClick={() => setConfirmSummaryOpen(false)}
          >
            <div
              className="modal-content"
              style={{
                width: 520,
                maxWidth: "92vw",
                maxHeight: "75vh",
                overflowY: "auto",
                color: "#111",
                position: "relative",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-close-row">
                <button
                  className="modal-close-btn"
                  title="Cerrar"
                  aria-label="Cerrar"
                  onClick={() => setConfirmSummaryOpen(false)}
                />
              </div>
              <h2 style={{ fontSize: "1.1rem", marginBottom: 10 }}>
                Venta confirmada (inventario no descontado automáticamente)
              </h2>
              <div
                style={{
                  fontSize: ".8rem",
                  lineHeight: 1.3,
                  background: "#fffbe6",
                  border: "1px solid #ffe58f",
                  padding: "8px 10px",
                  borderRadius: 6,
                }}
              >
                Esta confirmación solo actualizó el estado de la venta a{" "}
                <strong>{confirmSummary?.status_aplicado}</strong>. El
                inventario no fue modificado. Descuenta manualmente las piezas
                necesarias en la pantalla de inventario y registra cualquier
                residuo de forma manual.
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginTop: 16,
                  justifyContent: "flex-end",
                }}
              >
                <button
                  className="ventas-btn"
                  onClick={() => {
                    setConfirmSummaryOpen(false);
                    navigate("/residuos");
                  }}
                >
                  Ver Residuos
                </button>
                <button
                  className="cancel-btn"
                  onClick={() => setConfirmSummaryOpen(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sells;
