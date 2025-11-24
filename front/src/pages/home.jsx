import React, { useState, useRef, useEffect } from "react";
import "../App.css";

import { useNavigate, useLocation } from "react-router-dom";
import {
  FaUser,
  FaHome,
  FaBoxes,
  FaChartBar,
  FaReceipt,
  FaUsers,
  FaMoneyCheckAlt,
  FaRecycle,
  FaHourglassHalf,
  FaCheckCircle,
  FaTimesCircle,
  FaClipboardList,
  FaDollarSign,
  FaExclamationCircle,
  FaArrowRight,
  FaCalendarAlt,
  FaClock,
} from "react-icons/fa";
import { fetchWithAuth } from "../utils/auth";

const Home = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const menuRef = useRef();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/");
      return;
    }
    const user = JSON.parse(localStorage.getItem("user"));
    if (user && user.nombre) setUserName(user.nombre);
  }, [navigate]);

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
  }, [navigate]);

  // Cerrar menú usuario al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [stats, setStats] = useState({
    clientes: 0,
    cotizaciones: 0,
    pendientes: 0,
    pagadas: 0,
    canceladas: 0,
    montoTotal: 0,
    montoPendiente: 0,
  });
  const [recentSales, setRecentSales] = useState([]);
  const [chartData, setChartData] = useState([
    { label: "Lun", value: 0 },
    { label: "Mar", value: 0 },
    { label: "Mié", value: 0 },
    { label: "Jue", value: 0 },
    { label: "Vie", value: 0 },
    { label: "Sáb", value: 0 },
    { label: "Dom", value: 0 },
  ]);
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
  const cancelLogout = () => {
    setShowLogoutConfirm(false);
  };

  const handleConfig = () => {
    setMenuOpen(false);
    navigate("/config");
  };

  // Cargar datos reales para panel rápido y estadísticas
  useEffect(() => {
    const fetchDash = async () => {
      try {
        const [resClientes, resCots] = await Promise.all([
          fetchWithAuth(
            "https://estadias1-backend-production.up.railway.app/clientes",
            navigate
          ),
          fetchWithAuth(
            "https://estadias1-backend-production.up.railway.app/api/ordenes",
            navigate
          ),
        ]);
        const toJson = async (r) => {
          const t = await r.text();
          try {
            return JSON.parse(t);
          } catch {
            return t;
          }
        };
        const cData = await toJson(resClientes);
        const oData = await toJson(resCots);
        const clientesArr = Array.isArray(cData)
          ? cData
          : cData?.clientes || [];
        const cotArr = Array.isArray(oData?.data)
          ? oData.data
          : Array.isArray(oData)
          ? oData
          : [];
        const pendientes = cotArr.filter(
          (c) => (c.status || "").toLowerCase() === "pendiente"
        ).length;
        const pagadas = cotArr.filter(
          (c) => (c.status || "").toLowerCase() === "pagado"
        ).length;
        const canceladas = cotArr.filter(
          (c) => (c.status || "").toLowerCase() === "cancelado"
        ).length;
        const montoTotal = cotArr.reduce(
          (acc, c) => acc + Number(c.total || 0),
          0
        );
        const montoPendiente = cotArr.reduce((acc, c) => {
          const total = Number(c.total || 0);
          const anticipo = Number(c.anticipo || 0);
          return acc + Math.max(0, total - anticipo);
        }, 0);
        setStats({
          clientes: clientesArr.length,
          cotizaciones: cotArr.length,
          pendientes,
          pagadas,
          canceladas,
          montoTotal,
          montoPendiente,
        });
        const sorted = [...cotArr].sort(
          (a, b) =>
            new Date(b.fecha_creacion || b.fecha || 0) -
            new Date(a.fecha_creacion || a.fecha || 0)
        );
        setRecentSales(sorted.slice(0, 5));

        // Estadísticas semanales: conteo de cotizaciones por día (Lun-Dom) de la semana actual
        const now = new Date();
        // Obtener lunes de esta semana (considerando lunes como primer día)
        const day = (now.getDay() + 6) % 7; // 0..6 donde 0 = Lunes
        const monday = new Date(now);
        monday.setHours(0, 0, 0, 0);
        monday.setDate(now.getDate() - day);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        const counts = [0, 0, 0, 0, 0, 0, 0]; // Lun..Dom
        cotArr.forEach((c) => {
          const d = new Date(c.fecha_creacion || c.fecha || 0);
          if (!isNaN(d.getTime()) && d >= monday && d <= sunday) {
            const idx = (d.getDay() + 6) % 7; // 0..6 L-D
            counts[idx] += 1;
          }
        });
        setChartData([
          { label: "Lun", value: counts[0] },
          { label: "Mar", value: counts[1] },
          { label: "Mié", value: counts[2] },
          { label: "Jue", value: counts[3] },
          { label: "Vie", value: counts[4] },
          { label: "Sáb", value: counts[5] },
          { label: "Dom", value: counts[6] },
        ]);
      } catch (error) {
        if (error.message !== "Sesión expirada") {
          // silencioso para evitar ruido en dashboard
        }
      }
    };
    fetchDash();
  }, []);
  const maxValue = Math.max(...chartData.map((d) => d.value)) || 1;

  // Role
  let isAdmin = false;
  try {
    const userObj = JSON.parse(localStorage.getItem("user") || "{}");
    isAdmin = String(userObj?.rol || "").toLowerCase() === "admin";
  } catch {
    // ignore
  }

  const displayName = userName ? userName.split(" ")[0] : "Bienvenido";

  const formatNumber = (value) =>
    Number(value || 0).toLocaleString("es-MX");

  const formatCurrency = (value) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);

  const heroHighlights = [
    {
      label: "Cotizaciones activas",
      value: formatNumber(stats.cotizaciones),
      hint: "Registradas en el sistema",
    },
    {
      label: "Monto total",
      value: formatCurrency(stats.montoTotal),
      hint: "Acumulado histórico",
    },
    {
      label: "Saldo pendiente",
      value: formatCurrency(stats.montoPendiente),
      hint: "Por cobrar",
    },
  ];

  const quickActions = [
    {
      key: "inventario",
      title: "Inventario",
      description: "Control de catálogos y existencias",
      icon: <FaBoxes />,
      to: "/inventario",
      accent: "inventory",
    },
    {
      key: "ventas",
      title: "Ventas",
      description: "Seguimiento de cotizaciones y estatus",
      icon: <FaMoneyCheckAlt />,
      to: "/ventas",
      accent: "sales",
    },
    {
      key: "clientes",
      title: "Clientes",
      description: "Gestión de relaciones y contactos",
      icon: <FaUsers />,
      to: "/clientes",
      accent: "clients",
    },
    {
      key: "residuos",
      title: "Residuos",
      description: "Optimiza los sobrantes y mermas",
      icon: <FaRecycle />,
      to: "/residuos",
      accent: "waste",
    },
  ];

  if (isAdmin) {
    quickActions.push({
      key: "usuarios",
      title: "Usuarios",
      description: "Configura roles y accesos",
      icon: <FaUser />,
      to: "/usuarios",
      accent: "users",
    });
  }

  const kpiItems = [
    {
      key: "cotizaciones",
      label: "Cotizaciones",
      value: formatNumber(stats.cotizaciones),
      hint: "Registradas",
      icon: <FaClipboardList />,
      accent: "accent",
    },
    {
      key: "pendientes",
      label: "Pendientes",
      value: formatNumber(stats.pendientes),
      hint: "Para seguimiento",
      icon: <FaHourglassHalf />,
      accent: "warning",
    },
    {
      key: "pagadas",
      label: "Pagadas",
      value: formatNumber(stats.pagadas),
      hint: "Completadas",
      icon: <FaCheckCircle />,
      accent: "success",
    },
    {
      key: "canceladas",
      label: "Canceladas",
      value: formatNumber(stats.canceladas),
      hint: "Sin efecto",
      icon: <FaTimesCircle />,
      accent: "danger",
    },
    {
      key: "clientes",
      label: "Clientes",
      value: formatNumber(stats.clientes),
      hint: "Registrados",
      icon: <FaUsers />,
      accent: "info",
    },
    {
      key: "montoTotal",
      label: "Monto total",
      value: formatCurrency(stats.montoTotal),
      hint: "Acumulado",
      icon: <FaDollarSign />,
      accent: "primary",
    },
    {
      key: "saldoPendiente",
      label: "Saldo pendiente",
      value: formatCurrency(stats.montoPendiente),
      hint: "Por cobrar",
      icon: <FaExclamationCircle />,
      accent: "alert",
    },
  ];

  return (
    <div className="home-page">
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
              <div className="nav-title">INICIO</div>
            </div>
            <header className="header">
              <h1>
                INICIO <FaHome className="iconName" />
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

      <main className="home-main">
        <section className="home-hero">
          <div className="home-hero-text">
            <span className="home-hero-tag">Panel ejecutivo</span>
            <h2 className="home-hero-title">Hola, {displayName}</h2>
            <p className="home-hero-subtitle">
              Monitorea en un solo lugar el rendimiento comercial y operativo.
            </p>
            <div className="home-hero-meta">
              <div className="home-hero-meta-item">
                <span className="home-hero-meta-icon">
                  <FaCalendarAlt />
                </span>
                <div className="home-hero-meta-copy">
                  <span className="home-hero-meta-label">Fecha</span>
                  <span className="home-hero-meta-value">{dateStr}</span>
                </div>
              </div>
              <div className="home-hero-meta-item">
                <span className="home-hero-meta-icon">
                  <FaClock />
                </span>
                <div className="home-hero-meta-copy">
                  <span className="home-hero-meta-label">Hora</span>
                  <span className="home-hero-meta-value">{timeStr}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="home-hero-stats">
            {heroHighlights.map((item) => (
              <div key={item.label} className="home-hero-stat">
                <span className="home-hero-stat-label">{item.label}</span>
                <span
                  className="home-hero-stat-value"
                  style={{
                    wordBreak: 'break-all',
                    fontSize: String(item.value).replace(/[^\d]/g, '').length > 8 ? '1.1em' : undefined,
                    lineHeight: 1.1,
                    maxWidth: 140,
                    display: 'inline-block',
                  }}
                  title={item.value}
                >
                  {item.value}
                </span>
                {item.hint && (
                  <span className="home-hero-stat-hint">{item.hint}</span>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="home-dashboard">
          <div className="home-column home-column--primary">
            <section className="home-section">
              <header className="home-section-header">
                <div>
                  <h3>Accesos rápidos</h3>
                  <p>Ingresa a los módulos clave sin perder tiempo.</p>
                </div>
              </header>
              <div className="home-actions-grid">
                {quickActions.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    className={`home-card home-card-action home-card--${action.accent}`}
                    onClick={() => navigate(action.to)}
                  >
                    <span className="home-card-icon">{action.icon}</span>
                    <div className="home-card-copy">
                      <span className="home-card-title">{action.title}</span>
                      <span className="home-card-description">
                        {action.description}
                      </span>
                    </div>
                    <FaArrowRight className="home-card-chevron" />
                  </button>
                ))}
              </div>
            </section>

            <section className="home-section">
              <header className="home-section-header">
                <div>
                  <h3>Indicadores clave</h3>
                  <p>Seguimiento actualizado de la operación comercial.</p>
                </div>
              </header>
              <div className="home-kpi-grid">
                {kpiItems.map((item) => (
                  <article
                    key={item.key}
                    className={`home-kpi home-kpi--${item.accent}`}
                  >
                    <span className="home-kpi-icon">{item.icon}</span>
                    <div className="home-kpi-content">
                      <span className="home-kpi-label">{item.label}</span>
                      <span className="home-kpi-value">{item.value}</span>
                      {item.hint && (
                        <span className="home-kpi-caption">{item.hint}</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <div className="home-column home-column--secondary">
            <section className="home-panel">
              <header className="home-panel-header">
                <div className="home-panel-title">
                  <FaReceipt size={20} />
                  <div>
                    <h3>Últimas cotizaciones</h3>
                    <p>Movimientos recientes generados en el sistema.</p>
                  </div>
                </div>
                <span className="home-panel-chip">
                  {formatNumber(recentSales.length)}
                </span>
              </header>
              <div className="home-sales">
                <div className="home-sales-header">
                  <span>ID</span>
                  <span>Cliente</span>
                  <span>Total</span>
                  <span>Fecha</span>
                  <span>Estado</span>
                </div>
                <div className="home-sales-list">
                  {recentSales.length === 0 ? (
                    <div className="home-empty">Sin datos recientes</div>
                  ) : (
                    recentSales.map((sale) => {
                      const status = String(sale.status || "").toLowerCase();
                      const badgeClass = status
                        ? `status-badge status-${status}`
                        : "";
                      const total = formatCurrency(
                        Number(sale.total || sale.subtotal || 0)
                      );
                      const dateValue = new Date(
                        sale.fecha_creacion || sale.fecha || Date.now()
                      ).toLocaleDateString("es-MX");
                      return (
                        <div key={sale.id} className="home-sales-row">
                          <span className="home-sales-cell home-sales-cell--id">
                            {sale.id}
                          </span>
                          <span className="home-sales-cell home-sales-cell--client">
                            {sale.cliente || sale.Cliente?.nombre || "—"}
                          </span>
                          <span className="home-sales-cell home-sales-cell--total">
                            {total}
                          </span>
                          <span className="home-sales-cell home-sales-cell--date">
                            {dateValue}
                          </span>
                          <span className="home-sales-cell home-sales-cell--status">
                            {status ? (
                              <span className={badgeClass}>{status}</span>
                            ) : (
                              "—"
                            )}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>

            <section className="home-panel">
              <header className="home-panel-header">
                <div className="home-panel-title">
                  <FaChartBar size={20} />
                  <div>
                    <h3>Estadísticas de la semana</h3>
                    <p>Volumen diario de cotizaciones generadas.</p>
                  </div>
                </div>
              </header>
              <div className="home-chart">
                {chartData.map((d) => (
                  <div key={d.label} className="home-chart-bar">
                    <div
                      className="home-chart-bar-fill"
                      style={{ height: `${(d.value / maxValue) * 100}%` }}
                      aria-label={`${d.label}: ${d.value}`}
                    />
                    <span className="home-chart-bar-value">
                      {formatNumber(d.value)}
                    </span>
                    <span className="home-chart-bar-label">{d.label}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Home;
