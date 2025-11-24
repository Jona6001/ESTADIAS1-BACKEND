const {
  Cotizacion,
  VentasProductos,
  Producto,
  Cliente,
  Usuario,
  Residuo,
} = require("../models");
const HistorialAnticipos = require("../models/historialAnticiposModel");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// Crear una nueva orden (cotización con productos)
const crearOrden = async (req, res) => {
  try {
    const {
      nombre,
      ID_usuario,
      ID_cliente,
      productos,
      anticipo,
      incluir_iva = false,
      subtotal,
      iva = 0,
      total,
    } = req.body;

    // Validar que vengan los datos necesarios
    if (
      !nombre ||
      !ID_usuario ||
      !ID_cliente ||
      !productos ||
      productos.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Faltan datos obligatorios: nombre, ID_usuario, ID_cliente y productos",
      });
    }

    // Si no se enviaron nuevos productos pero sí cambió incluir_iva o se desea forzar recálculo, recalcular totales con los productos actuales
    if (productos === undefined && incluir_iva !== undefined) {
      const actuales = await VentasProductos.findAll({
        where: { cotizacionId: id },
        include: [
          {
            model: Producto,
            attributes: ["ID", "precio", "cantidad_m2", "medida_por_unidad"],
          },
        ],
      });
      let subtotalCalc = 0;
      for (const it of actuales) {
        // Usar el precio del producto, no el inventario
        const precioUnitario = Number(it.Producto?.precio || 0);
        // Determinar la cantidad según el tipo de medida
        const cantidad =
          it.tipo_medida === "piezas"
            ? Number(it.cantidad_piezas_calculada || it.cantidad || 0)
            : Number(it.cantidad_m2_calculada || it.cantidad || 0);
        subtotalCalc += precioUnitario * cantidad;
      }
      subtotalCalc = parseFloat(subtotalCalc.toFixed(2));
      const ivaCalc = incluir_iva
        ? parseFloat((subtotalCalc * 0.16).toFixed(2))
        : 0;
      const totalCalc = parseFloat((subtotalCalc + ivaCalc).toFixed(2));
      orden.subtotal = subtotalCalc;
      orden.iva = ivaCalc;
      orden.total = totalCalc;
    }

    // Verificar que el usuario exista
    const usuarioExiste = await Usuario.findByPk(ID_usuario);
    if (!usuarioExiste) {
      return res.status(404).json({
        success: false,
        message: `No se encontró el usuario con ID: ${ID_usuario}`,
      });
    }

    // Verificar que el cliente exista
    const clienteExiste = await Cliente.findByPk(ID_cliente);
    if (!clienteExiste) {
      return res.status(404).json({
        success: false,
        message: `No se encontró el cliente con ID: ${ID_cliente}`,
      });
    }

    // Crear la cotización con los valores calculados en el frontend
    const nuevaCotizacion = await Cotizacion.create({
      nombre,
      ID_usuario,
      ID_cliente,
      fecha_creacion: new Date(),
      subtotal: subtotal || 0.0,
      incluir_iva: incluir_iva,
      iva: iva || 0.0,
      total: total || 0.0,
      anticipo: anticipo || 0.0,
      status: "pendiente",
    });

    // Validar y crear los productos de la venta
    const productosCreados = [];
    let totalCotizacion = 0;

    for (const producto of productos) {
      const {
        productoId,
        cantidad = 1,
        tipo_medida, // "piezas" o "m2"
        descripcion,
      } = producto;

      // Validar que el producto exista
      const productoExiste = await Producto.findByPk(productoId);
      if (!productoExiste) {
        return res.status(404).json({
          success: false,
          message: `No se encontró el producto con ID: ${productoId}`,
        });
      }

      // Validar que venga el tipo de medida
      if (!tipo_medida || !["piezas", "m2"].includes(tipo_medida)) {
        return res.status(400).json({
          success: false,
          message:
            "Cada producto debe tener un tipo_medida válido: 'piezas' o 'm2'",
        });
      }

      // Validar que la cantidad sea válida
      if (!cantidad || cantidad <= 0) {
        return res.status(400).json({
          success: false,
          message: `La cantidad debe ser mayor que 0 para el producto ${productoExiste.nombre}`,
        });
      }

      // Determinar el tipo de producto
      const esProductoPorPiezas =
        productoExiste.cantidad_piezas !== null &&
        productoExiste.cantidad_m2 === null;
      const esProductoPorM2 =
        productoExiste.cantidad_m2 !== null &&
        productoExiste.medida_por_unidad !== null;

      // Validar compatibilidad entre el tipo de medida solicitado y el tipo de producto
      if (esProductoPorPiezas && tipo_medida !== "piezas") {
        return res.status(400).json({
          success: false,
          message: `El producto ${productoExiste.nombre} solo se puede vender por piezas`,
        });
      }

      if (esProductoPorM2 && tipo_medida !== "m2") {
        return res.status(400).json({
          success: false,
          message: `El producto ${productoExiste.nombre} solo se puede vender por m²`,
        });
      }

      if (!esProductoPorPiezas && !esProductoPorM2) {
        return res.status(400).json({
          success: false,
          message: `El producto ${productoExiste.nombre} tiene configuración de medidas inconsistente`,
        });
      }

      // Crear el registro en ventas_productos (el hook beforeSave calculará automáticamente las equivalencias)
      const ventaProducto = await VentasProductos.create({
        cotizacionId: nuevaCotizacion.ID,
        productoId,
        cantidad: Number(cantidad),
        tipo_medida: tipo_medida,
        descripcion: descripcion || null,
      });

      // El subtotal ya se calcula automáticamente en el hook beforeSave del modelo
      totalCotizacion += parseFloat(ventaProducto.subtotal || 0);

      productosCreados.push(ventaProducto);
    }

    // Si no se enviaron los totales desde el frontend, calcularlos automáticamente
    if (!subtotal && !total) {
      const subtotalCalculado = parseFloat(totalCotizacion.toFixed(2));
      const ivaCalculado = incluir_iva ? subtotalCalculado * 0.16 : 0;
      const totalCalculado = subtotalCalculado + ivaCalculado;

      nuevaCotizacion.subtotal = subtotalCalculado;
      nuevaCotizacion.iva = parseFloat(ivaCalculado.toFixed(2));
      nuevaCotizacion.total = parseFloat(totalCalculado.toFixed(2));
      await nuevaCotizacion.save();
    }

    // Obtener la cotización completa con los productos
    const ordenCompleta = await Cotizacion.findByPk(nuevaCotizacion.ID, {
      include: [
        {
          model: Usuario,
          attributes: ["ID", "nombre", "correo"],
        },
        {
          model: Cliente,
          attributes: ["ID", "nombre", "telefono", "rfc", "direccion"],
        },
      ],
    });

    return res.status(201).json({
      success: true,
      message: "Orden creada exitosamente",
      data: {
        cotizacion: ordenCompleta,
        productos: productosCreados,
      },
    });
  } catch (error) {
    console.error("Error al crear la orden:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor al crear la orden",
      error: error.message,
    });
  }
};

// Obtener todas las órdenes (cotizaciones)
const obtenerOrdenes = async (req, res) => {
  try {
    const ordenes = await Cotizacion.findAll({
      include: [
        {
          model: Usuario,
          attributes: ["ID", "nombre", "correo"],
        },
        {
          model: Cliente,
          attributes: ["ID", "nombre", "telefono", "rfc"],
        },
      ],
      order: [["fecha_creacion", "DESC"]],
    });

    // Enriquecer con metadatos de anticipos: conteo y último abono
    const enriched = await Promise.all(
      ordenes.map(async (o) => {
        try {
          const cotizacionId = o.ID;
          const abonos_count = await HistorialAnticipos.count({
            where: { cotizacionId },
          });
          let ultimo_abono_fecha = null;
          let ultimo_abono_monto = null;
          if (abonos_count > 0) {
            const ultimo = await HistorialAnticipos.findOne({
              where: { cotizacionId },
              order: [["fecha", "DESC"]],
            });
            if (ultimo) {
              ultimo_abono_fecha = ultimo.fecha || ultimo.createdAt || null;
              ultimo_abono_monto = ultimo.monto || null;
            }
          }
          const obj = o.toJSON();
          return {
            ...obj,
            abonos_count,
            ultimo_abono_fecha,
            ultimo_abono_monto,
          };
        } catch (e) {
          // En caso de error al enriquecer, devolver sin meta para no romper la lista
          return o;
        }
      })
    );

    return res.status(200).json({
      success: true,
      data: enriched,
    });
  } catch (error) {
    console.error("Error al obtener órdenes:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

// Obtener una orden por ID con sus productos
const obtenerOrdenPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const orden = await Cotizacion.findByPk(id, {
      include: [
        {
          model: Usuario,
          attributes: ["ID", "nombre", "correo"],
        },
        {
          model: Cliente,
          attributes: ["ID", "nombre", "telefono", "rfc", "direccion"],
        },
      ],
    });

    if (!orden) {
      return res.status(404).json({
        success: false,
        message: `No se encontró la orden con ID: ${id}`,
      });
    }

    // Obtener los productos de esta cotización
    const productos = await VentasProductos.findAll({
      where: { cotizacionId: id },
      include: [
        {
          model: Producto,
          attributes: ["ID", "nombre", "descripcion"],
        },
      ],
    });

    return res.status(200).json({
      success: true,
      data: {
        cotizacion: orden,
        productos: productos,
      },
    });
  } catch (error) {
    console.error("Error al obtener la orden:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

// Actualizar el status de una orden
const actualizarStatusOrden = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validar que el status sea válido
    if (
      ![
        "pendiente",
        "pagado",
        "cancelado",
        "en_proceso",
        "fabricado",
        "espera_material",
        "entregado",
      ].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Status inválido. Debe ser uno de: pendiente, pagado, cancelado, en_proceso, fabricado, espera_material, entregado",
      });
    }

    const orden = await Cotizacion.findByPk(id);

    if (!orden) {
      return res.status(404).json({
        success: false,
        message: `No se encontró la orden con ID: ${id}`,
      });
    }

    orden.status = status;
    await orden.save();

    return res.status(200).json({
      success: true,
      message: "Status actualizado exitosamente",
      data: orden,
    });
  } catch (error) {
    console.error("Error al actualizar el status:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

// Actualizar el anticipo de una orden
const actualizarAnticipo = async (req, res) => {
  try {
    const { id } = req.params;
    const { anticipo } = req.body;

    // Validar que el anticipo sea un número válido
    if (anticipo === undefined || anticipo === null || isNaN(anticipo)) {
      return res.status(400).json({
        success: false,
        message: "El campo 'anticipo' debe ser un número válido",
      });
    }

    // Validar que el anticipo no sea negativo
    if (anticipo < 0) {
      return res.status(400).json({
        success: false,
        message: "El anticipo no puede ser negativo",
      });
    }

    const orden = await Cotizacion.findByPk(id);

    if (!orden) {
      return res.status(404).json({
        success: false,
        message: `No se encontró la orden con ID: ${id}`,
      });
    }

    // Validar que el anticipo no sea mayor al total
    if (parseFloat(anticipo) > parseFloat(orden.total)) {
      return res.status(400).json({
        success: false,
        message: `El anticipo ($${anticipo}) no puede ser mayor al total de la orden ($${orden.total})`,
      });
    }

    orden.anticipo = parseFloat(anticipo).toFixed(2);

    // Si el anticipo es igual al total, marcar como pagado
    if (parseFloat(orden.anticipo) >= parseFloat(orden.total)) {
      orden.status = "pagado";
    }

    await orden.save();

    return res.status(200).json({
      success: true,
      message: "Anticipo actualizado exitosamente",
      data: {
        orden,
        saldo_pendiente: (
          parseFloat(orden.total) - parseFloat(orden.anticipo)
        ).toFixed(2),
      },
    });
  } catch (error) {
    console.error("Error al actualizar el anticipo:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

// Actualizar una orden completa (cliente, productos, anticipo y/o status)
// Además: ajusta inventario por DIFERENCIAS cuando cambia el contenido de la orden.
// Regla:
// - Si aumentan los m2 (por producto), se descuentan las piezas adicionales necesarias del inventario
//   y se registra un Residuo por esa diferencia (si aplica residuo > 0).
// - Si disminuyen los m2 (por producto), se regresan las piezas completas sobrantes al inventario.
//   (No se modifican registros de residuos históricos).
const actualizarOrden = async (req, res) => {
  try {
    const { id } = req.params;
    // Aceptar campos adicionales para permitir edición completa (nombre, incluir_iva)
    const { ID_cliente, productos, anticipo, status, nombre, incluir_iva } =
      req.body;

    const orden = await Cotizacion.findByPk(id);
    if (!orden) {
      return res.status(404).json({
        success: false,
        message: `No se encontró la orden con ID: ${id}`,
      });
    }

    // Permitir modificar productos SOLO cuando la orden está 'pendiente'.
    if (req.body.productos !== undefined && orden.status !== "pendiente") {
      return res.status(400).json({
        success: false,
        message:
          "Solo se pueden modificar productos cuando el estado es 'pendiente'. Cambie el estado a 'pendiente' o duplique la cotización para continuar.",
      });
    }

    // Cambiar cliente si se envía
    if (ID_cliente !== undefined) {
      const clienteExiste = await Cliente.findByPk(ID_cliente);
      if (!clienteExiste) {
        return res.status(404).json({
          success: false,
          message: `No se encontró el cliente con ID: ${ID_cliente}`,
        });
      }
      orden.ID_cliente = ID_cliente;
    }

    // Permitir actualizar nombre/incluir_iva aunque no cambien productos
    if (typeof nombre === "string" && nombre.trim().length > 0) {
      orden.nombre = nombre.trim();
    }
    if (typeof incluir_iva === "boolean") {
      orden.incluir_iva = incluir_iva;
    }

    // Reemplazar productos si se envían
    if (productos !== undefined) {
      if (!Array.isArray(productos) || productos.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Se debe enviar al menos un producto para actualizar",
        });
      }

      // 1) Calcular diferencias contra los productos actuales de la orden
      //    a) Cargar productos actuales y sumar m2 por productoId
      const actuales = await VentasProductos.findAll({
        where: { cotizacionId: id },
        include: [{ model: Producto, attributes: ["ID", "medida_por_unidad"] }],
      });
      const m2ActualPorProducto = new Map();
      for (const vp of actuales) {
        const key = vp.productoId;
        // Para registros previos que no tenían total_m2, derivar de tipo_medida
        let derivadoM2 = 0;
        if (vp.tipo_medida === "m2") {
          derivadoM2 = Number(vp.cantidad || 0);
        } else if (vp.tipo_medida === "piezas") {
          // Convertir piezas a m2 usando medida_por_unidad si existe
          const m2PorPieza = Number(vp.Producto?.medida_por_unidad || 0);
          derivadoM2 =
            m2PorPieza > 0 ? Number(vp.cantidad || 0) * m2PorPieza : 0;
        }
        m2ActualPorProducto.set(
          key,
          (m2ActualPorProducto.get(key) || 0) +
            (Number(vp.total_m2) || derivadoM2)
        );
      }

      //    b) Calcular m2 nuevos por productoId a partir del payload
      const m2NuevoPorProducto = new Map();
      const detalleNuevos = []; // preserva los cálculos para re-crear VP y total
      let totalCotizacion = 0;
      for (const p of productos) {
        const {
          productoId,
          cantidad = 1,
          descripcion,
          tipo_medida, // puede ser 'piezas' o 'm2'
        } = p;

        const productoExiste = await Producto.findByPk(productoId);
        if (!productoExiste) {
          return res.status(404).json({
            success: false,
            message: `No se encontró el producto con ID: ${productoId}`,
          });
        }

        // Validar tipo_medida según el producto
        const esProductoPorPiezas =
          productoExiste.cantidad_piezas !== null &&
          productoExiste.cantidad_m2 === null;
        const esProductoPorM2 =
          productoExiste.cantidad_m2 !== null &&
          productoExiste.medida_por_unidad !== null;

        if (esProductoPorPiezas && tipo_medida !== "piezas") {
          return res.status(400).json({
            success: false,
            message: `El producto ${productoExiste.nombre} solo se puede vender por piezas`,
          });
        }

        if (esProductoPorM2 && tipo_medida !== "m2") {
          return res.status(400).json({
            success: false,
            message: `El producto ${productoExiste.nombre} solo se puede vender por m²`,
          });
        }

        // Calcular cantidad y subtotal según el tipo de medida
        const precioUnitario = parseFloat(productoExiste.precio || 0);
        let cantidadCalculada = Number(cantidad || 0);
        let total_m2 = 0;

        if (tipo_medida === "m2") {
          total_m2 = cantidadCalculada;
        } else if (tipo_medida === "piezas") {
          // Para piezas, calcular m2 equivalentes si existe medida_por_unidad
          const m2PorPieza = productoExiste.medida_por_unidad || 0;
          total_m2 = cantidadCalculada * m2PorPieza;
        }

        const subtotal = cantidadCalculada * precioUnitario;
        totalCotizacion += subtotal;

        // Acumular por producto
        m2NuevoPorProducto.set(
          productoId,
          (m2NuevoPorProducto.get(productoId) || 0) + Number(total_m2)
        );

        // Guardar detalle para re-crear VP luego
        detalleNuevos.push({
          productoId,
          cantidad: Number(cantidad || 1),
          total_m2: parseFloat(Number(total_m2).toFixed(4)),
          descripcion: descripcion || null,
          tipo_medida: tipo_medida,
        });
      }

      // 2) Ajustar inventario por diferencias (delta de piezas por producto)
      //    - Calculamos piezas = ceil(total_m2 / medida_por_unidad)
      const ajustes = [];
      let ajusteInventarioAplicado = false;
      const productoCache = new Map();
      const getProducto = async (idProd) => {
        if (!productoCache.has(idProd)) {
          const pr = await Producto.findByPk(idProd);
          productoCache.set(idProd, pr);
        }
        return productoCache.get(idProd);
      };

      // Conjunto de todos los productos involucrados (antes y después)
      const allProductoIds = new Set([
        ...Array.from(m2ActualPorProducto.keys()),
        ...Array.from(m2NuevoPorProducto.keys()),
      ]);

      for (const pid of allProductoIds) {
        const prod = await getProducto(pid);
        if (!prod) continue; // si el producto ya no existe, omitir
        const m2Antes = Number(m2ActualPorProducto.get(pid) || 0);
        const m2Despues = Number(m2NuevoPorProducto.get(pid) || 0);
        const m2PorPieza = Number(prod.medida_por_unidad || 0);
        if (m2PorPieza <= 0) continue;

        const piezasAntes = Math.ceil(m2Antes / m2PorPieza);
        const piezasDespues = Math.ceil(m2Despues / m2PorPieza);
        const deltaPiezas = piezasDespues - piezasAntes;

        if (deltaPiezas > 0) {
          // Aumentan las piezas necesarias -> descontar del inventario
          const inventarioInsuficiente = prod.cantidad_piezas < deltaPiezas;

          prod.cantidad_piezas -= deltaPiezas;
          await prod.save();

          ajustes.push({
            productoId: pid,
            nombre: prod.nombre,
            deltaPiezas,
            inventario_insuficiente: inventarioInsuficiente,
            deficit: inventarioInsuficiente
              ? deltaPiezas - (prod.cantidad_piezas + deltaPiezas)
              : 0,
          });
          ajusteInventarioAplicado = true;

          // Registrar Residuo por la diferencia (si hay residuo > 0)
          // m2 adicionales requeridos vs piezas enteras usadas
          const m2Adicionales = Math.max(0, m2Despues - m2Antes);
          const m2Usados = deltaPiezas * m2PorPieza;
          const residuoM2 = Math.max(0, m2Usados - m2Adicionales);
          const porcentajeResiduo =
            m2PorPieza > 0 ? (residuoM2 / m2PorPieza) * 100 : 0;

          if (residuoM2 > 0) {
            try {
              await Residuo.create({
                cotizacionId: id,
                productoId: pid,
                piezas_usadas: deltaPiezas,
                m2_necesarios: parseFloat(m2Adicionales.toFixed(4)),
                m2_usados: parseFloat(m2Usados.toFixed(4)),
                m2_residuo: parseFloat(residuoM2.toFixed(4)),
                porcentaje_residuo: parseFloat(porcentajeResiduo.toFixed(2)),
                medida_por_unidad: m2PorPieza,
                estado: "disponible",
                observaciones: "Ajuste por edición de orden",
                fecha_creacion: new Date(),
                ID_usuario_registro: req.usuario?.ID || null,
              });
            } catch (e) {
              // Si falla el registro del residuo, no detenemos el flujo de actualización
              console.error(
                "No se pudo registrar residuo diferencial:",
                e.message
              );
            }
          }
        } else if (deltaPiezas < 0) {
          // Reducen las piezas necesarias -> regresar piezas sobrantes al inventario
          const piezasARegresar = Math.abs(deltaPiezas);
          prod.cantidad_piezas += piezasARegresar;
          await prod.save();
          ajustes.push({ productoId: pid, nombre: prod.nombre, deltaPiezas });
          ajusteInventarioAplicado = true;
          // Nota: no alteramos los residuos históricos
        }
      }

      // 3) Borrar productos actuales y re-crear con la nueva definición
      await VentasProductos.destroy({ where: { cotizacionId: id } });

      const productosNuevos = [];
      for (const det of detalleNuevos) {
        const vp = await VentasProductos.create({
          cotizacionId: id,
          ...det,
        });
        productosNuevos.push(vp);
      }

      // Recalcular subtotal/iva/total con bandera incluir_iva
      const subtotalCalc = parseFloat(totalCotizacion.toFixed(2));
      const ivaCalc = orden.incluir_iva
        ? parseFloat((subtotalCalc * 0.16).toFixed(2))
        : 0;
      const totalCalc = parseFloat((subtotalCalc + ivaCalc).toFixed(2));
      orden.subtotal = subtotalCalc;
      orden.iva = ivaCalc;
      orden.total = totalCalc;

      // Guardar marca de ajuste en memoria de la request para retornarla
      req._ajusteInventarioAplicado = ajusteInventarioAplicado;
      req._ajustesResumen = ajustes;
    }

    // Actualizar anticipo si se envía (validando contra total recalculado)
    if (anticipo !== undefined) {
      if (isNaN(anticipo) || Number(anticipo) < 0) {
        return res.status(400).json({
          success: false,
          message: "El campo 'anticipo' debe ser un número válido >= 0",
        });
      }
      if (Number(anticipo) > Number(orden.total)) {
        return res.status(400).json({
          success: false,
          message: `El anticipo ($${anticipo}) no puede ser mayor al total de la orden ($${orden.total})`,
        });
      }
      orden.anticipo = parseFloat(Number(anticipo).toFixed(2));
      if (orden.anticipo >= orden.total && status === undefined) {
        orden.status = "pagado";
      }
    }

    // Actualizar status si se envía
    if (status !== undefined) {
      if (
        ![
          "pendiente",
          "pagado",
          "cancelado",
          "en_proceso",
          "fabricado",
          "espera_material",
          "entregado",
        ].includes(status)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Status inválido. Debe ser uno de: pendiente, pagado, cancelado, en_proceso, fabricado, espera_material, entregado",
        });
      }
      orden.status = status;
    }

    await orden.save();

    // Responder con orden + productos
    const ordenIncluida = await Cotizacion.findByPk(orden.ID, {
      include: [
        { model: Usuario, attributes: ["ID", "nombre", "correo"] },
        {
          model: Cliente,
          attributes: ["ID", "nombre", "telefono", "rfc", "direccion"],
        },
      ],
    });
    const productosResp = await VentasProductos.findAll({
      where: { cotizacionId: orden.ID },
      include: [
        { model: Producto, attributes: ["ID", "nombre", "descripcion"] },
      ],
    });

    // Verificar si hay ajustes con inventario insuficiente
    const ajustesConDeficit = Array.isArray(req._ajustesResumen)
      ? req._ajustesResumen.filter((a) => a.inventario_insuficiente)
      : [];
    const hayDeficitEnAjustes = ajustesConDeficit.length > 0;

    return res.status(200).json({
      success: true,
      message: hayDeficitEnAjustes
        ? "Orden actualizada exitosamente. ADVERTENCIA: Algunos productos quedaron con inventario negativo."
        : "Orden actualizada exitosamente",
      data: {
        cotizacion: ordenIncluida,
        productos: productosResp,
        ajusteInventarioAplicado: Boolean(req._ajusteInventarioAplicado),
        ajustes: Array.isArray(req._ajustesResumen) ? req._ajustesResumen : [],
        inventario_insuficiente: hayDeficitEnAjustes,
        productos_con_deficit: ajustesConDeficit,
      },
    });
  } catch (error) {
    console.error("Error al actualizar la orden:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor al actualizar la orden",
      error: error.message,
    });
  }
};

// Calcular inventario necesario y residuos (PASO 1)
const calcularInventarioNecesario = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener la orden con sus productos
    const orden = await Cotizacion.findByPk(id);
    if (!orden) {
      return res.status(404).json({
        success: false,
        message: "Orden no encontrada",
      });
    }

    // Verificar que tenga al menos 70% de anticipo
    const porcentajeAnticipo =
      (parseFloat(orden.anticipo) / parseFloat(orden.total)) * 100;
    if (porcentajeAnticipo < 70) {
      return res.status(400).json({
        success: false,
        message: `Se requiere al menos 70% de anticipo para procesar inventario. Anticipo actual: ${porcentajeAnticipo.toFixed(
          2
        )}%`,
        porcentaje_actual: porcentajeAnticipo.toFixed(2),
      });
    }

    // Obtener productos de la orden
    const productosOrden = await VentasProductos.findAll({
      where: { cotizacionId: id },
    });

    if (productosOrden.length === 0) {
      return res.status(400).json({
        success: false,
        message: "La orden no tiene productos asociados",
      });
    }

    const analisisInventario = [];

    for (const item of productosOrden) {
      const producto = await Producto.findByPk(item.productoId);

      if (!producto) {
        return res.status(404).json({
          success: false,
          message: `No se encontró el producto con ID: ${item.productoId}`,
        });
      }

      // Calcular cuántas piezas se necesitan
      const m2Necesarios =
        item.total_m2 != null
          ? Number(item.total_m2)
          : item.cantidad_m2_calculada != null
          ? Number(item.cantidad_m2_calculada)
          : item.tipo_medida === "m2"
          ? Number(item.cantidad || 0)
          : Number(producto.medida_por_unidad || 0) *
            Number(item.cantidad || 0);
      const m2PorPieza = producto.medida_por_unidad;

      if (m2PorPieza <= 0) {
        return res.status(400).json({
          success: false,
          message: `El producto "${producto.nombre}" tiene una medida por unidad inválida (${m2PorPieza})`,
        });
      }

      const piezasNecesariasExactas = m2Necesarios / m2PorPieza;
      const piezasNecesarias = Math.ceil(piezasNecesariasExactas);

      // Calcular residuo
      const m2Usados = piezasNecesarias * m2PorPieza;
      const residuo = m2Usados - m2Necesarios;
      const porcentajeResiduoPieza = (residuo / m2PorPieza) * 100;

      // Determinar si es un residuo pequeño (menos del 15% de una pieza)
      const esResiduoPequeno = porcentajeResiduoPieza < 15;

      analisisInventario.push({
        productoId: producto.ID,
        nombreProducto: producto.nombre,
        m2_necesarios: parseFloat(m2Necesarios.toFixed(4)),
        m2_por_pieza: m2PorPieza,
        piezas_disponibles: producto.cantidad_piezas,
        piezas_necesarias_exactas: parseFloat(
          piezasNecesariasExactas.toFixed(2)
        ),
        piezas_necesarias: piezasNecesarias,
        piezas_sobrantes_inventario: parseFloat(
          (producto.cantidad_piezas - piezasNecesarias).toFixed(2)
        ),
        m2_usados: parseFloat(m2Usados.toFixed(4)),
        residuo_m2: parseFloat(residuo.toFixed(4)),
        porcentaje_residuo: parseFloat(porcentajeResiduoPieza.toFixed(2)),
        es_residuo_pequeno: esResiduoPequeno,
        tiene_suficiente_inventario:
          producto.cantidad_piezas >= piezasNecesarias,
        sugerencia: esResiduoPequeno
          ? "Se recomienda descartar el residuo por ser muy pequeño"
          : "Se recomienda guardar el residuo para futuros proyectos",
      });
    }

    // Verificar si hay inventario insuficiente
    const inventarioInsuficiente = analisisInventario.filter(
      (item) => !item.tiene_suficiente_inventario
    );

    return res.status(200).json({
      success: true,
      message: "Análisis de inventario calculado exitosamente",
      data: {
        ordenId: orden.ID,
        cliente: orden.ID_cliente,
        anticipo: parseFloat(orden.anticipo),
        total: parseFloat(orden.total),
        porcentaje_anticipo: parseFloat(porcentajeAnticipo.toFixed(2)),
        puede_confirmar:
          porcentajeAnticipo >= 70 && inventarioInsuficiente.length === 0,
        productos: analisisInventario,
        errores_inventario:
          inventarioInsuficiente.length > 0
            ? inventarioInsuficiente.map(
                (p) =>
                  `${p.nombreProducto}: necesita ${p.piezas_necesarias}, disponible ${p.piezas_disponibles}`
              )
            : [],
      },
    });
  } catch (error) {
    console.error("Error al calcular inventario:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor al calcular inventario",
      error: error.message,
    });
  }
};

// Confirmar y descontar inventario con registro de residuos (PASO 2)
const confirmarInventario = async (req, res) => {
  try {
    const { id } = req.params;
    const { productos_confirmados, ID_usuario } = req.body;
    // productos_confirmados: [{ productoId: 1, guardar_residuo: true, observaciones: "..." }, ...]

    if (!ID_usuario) {
      return res.status(400).json({
        success: false,
        message: "Se requiere ID_usuario para registrar la operación",
      });
    }

    if (!productos_confirmados || productos_confirmados.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Se requiere el array 'productos_confirmados' con las decisiones sobre residuos",
      });
    }

    const orden = await Cotizacion.findByPk(id);
    if (!orden) {
      return res.status(404).json({
        success: false,
        message: "Orden no encontrada",
      });
    }

    // Verificar anticipo ≥ 70%
    const porcentajeAnticipo =
      (parseFloat(orden.anticipo) / parseFloat(orden.total)) * 100;
    if (porcentajeAnticipo < 70) {
      return res.status(400).json({
        success: false,
        message:
          "Se requiere al menos 70% de anticipo para confirmar inventario",
        porcentaje_actual: porcentajeAnticipo.toFixed(2),
      });
    }

    const productosOrden = await VentasProductos.findAll({
      where: { cotizacionId: id },
    });

    if (productosOrden.length === 0) {
      return res.status(400).json({
        success: false,
        message: "La orden no tiene productos asociados",
      });
    }

    const resultados = [];
    const residuosCreados = [];

    for (const item of productosOrden) {
      const producto = await Producto.findByPk(item.productoId);

      if (!producto) {
        return res.status(404).json({
          success: false,
          message: `No se encontró el producto con ID: ${item.productoId}`,
        });
      }

      const confirmacion = productos_confirmados.find(
        (p) => p.productoId === item.productoId
      );

      if (!confirmacion) {
        return res.status(400).json({
          success: false,
          message: `Falta la confirmación para el producto: ${producto.nombre}`,
        });
      }

      const m2Necesarios =
        item.total_m2 != null
          ? Number(item.total_m2)
          : item.cantidad_m2_calculada != null
          ? Number(item.cantidad_m2_calculada)
          : item.tipo_medida === "m2"
          ? Number(item.cantidad || 0)
          : Number(producto.medida_por_unidad || 0) *
            Number(item.cantidad || 0);
      const m2PorPieza = producto.medida_por_unidad;
      const piezasNecesariasExactas = m2Necesarios / m2PorPieza;
      const piezasNecesarias = Math.ceil(piezasNecesariasExactas);

      // Verificar inventario y crear advertencia si es insuficiente
      const inventarioInsuficiente =
        producto.cantidad_piezas < piezasNecesarias;
      const inventarioAnterior = producto.cantidad_piezas;

      // Calcular residuo
      const m2Usados = piezasNecesarias * m2PorPieza;
      const residuoM2 = m2Usados - m2Necesarios;
      const porcentajeResiduo = (residuoM2 / m2PorPieza) * 100;

      // Descontar del inventario (permitir valores negativos)
      producto.cantidad_piezas -= piezasNecesarias;
      await producto.save();

      // Registrar el residuo en la tabla de Residuos
      if (confirmacion.guardar_residuo && residuoM2 > 0) {
        const nuevoResiduo = await Residuo.create({
          cotizacionId: id,
          productoId: item.productoId,
          piezas_usadas: piezasNecesarias,
          m2_necesarios: m2Necesarios,
          m2_usados: m2Usados,
          m2_residuo: residuoM2,
          porcentaje_residuo: porcentajeResiduo,
          medida_por_unidad: m2PorPieza,
          estado: "disponible",
          observaciones: confirmacion.observaciones || null,
          fecha_creacion: new Date(),
          ID_usuario_registro: ID_usuario,
        });

        residuosCreados.push({
          residuoId: nuevoResiduo.ID,
          producto: producto.nombre,
          m2_residuo: parseFloat(residuoM2.toFixed(4)),
          porcentaje: parseFloat(porcentajeResiduo.toFixed(2)),
          estado: "disponible",
        });
      }

      resultados.push({
        producto: producto.nombre,
        productoId: producto.ID,
        piezas_necesarias: piezasNecesarias,
        piezas_usadas_exactas: parseFloat(piezasNecesariasExactas.toFixed(2)),
        piezas_descontadas: piezasNecesarias,
        piezas_disponibles_antes: inventarioAnterior,
        piezas_restantes: parseFloat(producto.cantidad_piezas.toFixed(2)),
        m2_necesarios: parseFloat(m2Necesarios.toFixed(4)),
        m2_usados: parseFloat(m2Usados.toFixed(4)),
        residuo_m2: parseFloat(residuoM2.toFixed(4)),
        residuo_guardado: confirmacion.guardar_residuo && residuoM2 > 0,
        inventario_insuficiente: inventarioInsuficiente,
        deficit: inventarioInsuficiente
          ? piezasNecesarias - inventarioAnterior
          : 0,
      });
    }

    // Verificar si hay productos con inventario insuficiente
    const productosConDeficit = resultados.filter(
      (r) => r.inventario_insuficiente
    );
    const hayInventarioInsuficiente = productosConDeficit.length > 0;

    return res.status(200).json({
      success: true,
      message: hayInventarioInsuficiente
        ? "Inventario confirmado y descontado exitosamente. ADVERTENCIA: Algunos productos quedan con inventario negativo."
        : "Inventario confirmado y descontado exitosamente",
      data: {
        ordenId: id,
        productos_procesados: resultados,
        residuos_registrados: residuosCreados,
        total_residuos_guardados: residuosCreados.length,
        inventario_insuficiente: hayInventarioInsuficiente,
        productos_con_deficit: productosConDeficit.map((p) => ({
          producto: p.producto,
          deficit: p.deficit,
          inventario_quedara_en: p.piezas_restantes,
        })),
        total_productos_con_deficit: productosConDeficit.length,
      },
    });
  } catch (error) {
    console.error("Error al confirmar inventario:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor al confirmar inventario",
      error: error.message,
    });
  }
};

// Listar residuos disponibles
const listarResiduosDisponibles = async (req, res) => {
  try {
    const { productoId, estado } = req.query;

    const whereClause = {};
    if (productoId) whereClause.productoId = productoId;
    if (estado) whereClause.estado = estado;
    else whereClause.estado = "disponible"; // Por defecto mostrar solo disponibles

    const residuos = await Residuo.findAll({
      where: whereClause,
      include: [
        {
          model: Producto,
          attributes: ["ID", "nombre", "descripcion"],
        },
        {
          model: Cotizacion,
          attributes: ["ID", "fecha_creacion"],
        },
      ],
      order: [["fecha_creacion", "DESC"]],
    });

    // Agrupar por producto
    const residuosPorProducto = {};
    let totalM2Disponibles = 0;

    residuos.forEach((residuo) => {
      const productoNombre = residuo.Producto.nombre;

      if (!residuosPorProducto[productoNombre]) {
        residuosPorProducto[productoNombre] = {
          productoId: residuo.productoId,
          producto: productoNombre,
          total_m2: 0,
          cantidad_residuos: 0,
          residuos: [],
        };
      }

      residuosPorProducto[productoNombre].total_m2 += residuo.m2_residuo;
      residuosPorProducto[productoNombre].cantidad_residuos += 1;
      residuosPorProducto[productoNombre].residuos.push({
        id: residuo.ID,
        m2: parseFloat(residuo.m2_residuo.toFixed(4)),
        porcentaje: parseFloat(residuo.porcentaje_residuo.toFixed(2)),
        fecha: residuo.fecha_creacion,
        cotizacion: residuo.cotizacionId,
        observaciones: residuo.observaciones,
      });

      totalM2Disponibles += residuo.m2_residuo;
    });

    return res.status(200).json({
      success: true,
      data: {
        total_residuos: residuos.length,
        total_m2_disponibles: parseFloat(totalM2Disponibles.toFixed(4)),
        por_producto: Object.values(residuosPorProducto),
        todos_los_residuos: residuos.map((r) => ({
          id: r.ID,
          producto: r.Producto.nombre,
          m2_residuo: parseFloat(r.m2_residuo.toFixed(4)),
          porcentaje: parseFloat(r.porcentaje_residuo.toFixed(2)),
          estado: r.estado,
          fecha: r.fecha_creacion,
          cotizacion: r.cotizacionId,
          observaciones: r.observaciones,
        })),
      },
    });
  } catch (error) {
    console.error("Error al listar residuos:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

// Generar factura en PDF
const generarFacturaPDF = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener la orden completa con todas las relaciones
    const orden = await Cotizacion.findByPk(id, {
      include: [
        {
          model: Usuario,
          attributes: ["ID", "nombre", "correo", "telefono"],
        },
        {
          model: Cliente,
          attributes: ["ID", "nombre", "telefono", "rfc", "direccion"],
        },
      ],
    });

    if (!orden) {
      return res.status(404).json({
        success: false,
        message: "Orden no encontrada",
      });
    }

    // Obtener los productos de la orden
    const productosOrden = await VentasProductos.findAll({
      where: { cotizacionId: id },
      include: [
        {
          model: Producto,
          attributes: ["ID", "nombre", "descripcion", "cantidad_m2"],
        },
      ],
    });

    if (productosOrden.length === 0) {
      return res.status(400).json({
        success: false,
        message: "La orden no tiene productos asociados",
      });
    }

    // Crear directorio de facturas si no existe
    const facturasDir = path.join(__dirname, "../../facturas");
    if (!fs.existsSync(facturasDir)) {
      fs.mkdirSync(facturasDir, { recursive: true });
    }

    // Nombre del archivo
    const nombreArchivo = `factura_${id}_${Date.now()}.pdf`;
    const rutaArchivo = path.join(facturasDir, nombreArchivo);

    // Crear el documento PDF (tamaño carta por defecto). Márgenes moderados.
    const doc = new PDFDocument({ margin: 40 });
    const stream = fs.createWriteStream(rutaArchivo);
    doc.pipe(stream);

    // Color guinda para líneas
    const colorGuinda = "#8B1818";

    // --- ENCABEZADO NUEVO (estilo cotización) ---
    // Logo: preferir imágenes en Back/img, con fallback al asset del front
    const logoPathPrimary = path.join(__dirname, "../../img/LOGO.png");
    const logoPathAlt = path.join(__dirname, "../../img/logo.jpg");
    const logoPathFront = path.join(
      __dirname,
      "../../front/petro-arte/src/assets/logo-petro.png"
    );
    const logoPath = fs.existsSync(logoPathPrimary)
      ? logoPathPrimary
      : fs.existsSync(logoPathAlt)
      ? logoPathAlt
      : logoPathFront;
    // Utilidad para truncar texto manteniendo ancho
    const truncateToWidth = (
      text,
      maxWidth,
      fontSize = 12,
      fontName = "Helvetica-Bold"
    ) => {
      if (!text) return "";
      doc.font(fontName).fontSize(fontSize);
      if (doc.widthOfString(text) <= maxWidth) return text;
      let truncated = text;
      while (
        truncated.length > 0 &&
        doc.widthOfString(truncated + "…") > maxWidth
      ) {
        truncated = truncated.slice(0, -1);
      }
      return truncated + "…";
    };
    // Datos de contacto de la EMPRESA (no del vendedor)
    const COMPANY_PHONE = process.env.COMPANY_PHONE || "6181295414";
    const COMPANY_EMAIL =
      process.env.COMPANY_EMAIL || "petro_arte08@hotmail.com";
    const COMPANY_WEBSITE = process.env.COMPANY_WEBSITE || "petroarte.com";
    const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || "Durango, México";
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 40, 35, { width: 90 });
    }
    // Datos de contacto (parte superior derecha)
    // Reacomodar layout más a la izquierda y compacto
    const colLeftX = 170; // antes 300
    const colRightX = 360; // antes 460
    const rowH = 22;
    const iconSize = 16;
    // Usar nombres reales agregados por el usuario con espacios
    const iconPhone = path.join(__dirname, "../../img/cell icon.png");
    const iconMail = path.join(__dirname, "../../img/email icon.png");
    const iconWeb = path.join(__dirname, "../../img/web icon.png");
    const iconLoc = path.join(__dirname, "../../img/location icon.png");

    const iconCircleR = 8.5;
    const drawFallbackIcon = (x, y, glyph) => {
      doc.save();
      doc
        .fillColor(colorGuinda)
        .circle(x + iconCircleR, y + iconCircleR, iconCircleR)
        .fill();
      doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(iconCircleR + 3)
        .text(glyph, x, y + 1, {
          width: iconCircleR * 2,
          align: "center",
        });
      doc.restore();
    };
    const renderIcon = (imgPath, x, y, glyph) => {
      if (fs.existsSync(imgPath)) {
        doc.image(imgPath, x, y, { width: iconSize, height: iconSize });
      } else {
        drawFallbackIcon(x, y, glyph);
      }
    };

    // Helper para imprimir label + valor compactado: si el valor excede ancho, lo coloca debajo
    // Reduce texto para que quepa en una sola línea si es necesario
    const shrinkToWidth = (
      text,
      targetWidth,
      startSize = 11,
      minSize = 8,
      fontName = "Helvetica"
    ) => {
      let size = startSize;
      doc.font(fontName).fontSize(size);
      if (doc.widthOfString(text) <= targetWidth) return size;
      while (size > minSize && doc.widthOfString(text) > targetWidth) {
        size -= 1;
        doc.fontSize(size);
      }
      return size; // tamaño final usado (puede seguir desbordando, se puede truncar si se desea)
    };

    const printLabelValue = (
      label,
      value,
      xBase,
      yBase,
      maxWidthValue,
      opts = {}
    ) => {
      const labelX = xBase + iconSize + 8;
      const valueInlineX = labelX + 70; // posición para valor en misma línea
      doc.fontSize(10).fillColor("#444").text(label, labelX, yBase);
      doc.fillColor("#000");

      const { stackBelow = false, shrinkSingleLine = false } = opts;

      if (shrinkSingleLine) {
        // Intentar que quepa en una sola línea reduciendo tamaño
        const finalSize = shrinkToWidth(value, maxWidthValue, 11, 8);
        doc.fontSize(finalSize);
      } else {
        doc.fontSize(11);
      }

      if (!stackBelow) {
        // imprimir en la misma línea si cabe, si no stack
        if (doc.widthOfString(value) <= maxWidthValue) {
          doc.text(value, valueInlineX, yBase, { width: maxWidthValue });
          return yBase + rowH;
        } else {
          const wrappedHeight = doc.heightOfString(value, {
            width: maxWidthValue,
          });
          doc.text(value, labelX, yBase + 12, { width: maxWidthValue });
          return yBase + 12 + wrappedHeight + 6;
        }
      } else {
        // Siempre debajo del label
        const wrappedHeight = doc.heightOfString(value, {
          width: maxWidthValue,
        });
        doc.text(value, labelX, yBase + 12, { width: maxWidthValue });
        return yBase + 12 + wrappedHeight + 6;
      }
    };

    let contactYLeft = 40;
    renderIcon(iconPhone, colLeftX, contactYLeft, "☎");
    contactYLeft = printLabelValue(
      "Teléfono",
      COMPANY_PHONE,
      colLeftX,
      contactYLeft,
      110
    );
    renderIcon(iconWeb, colLeftX, contactYLeft, "🌐");
    contactYLeft = printLabelValue(
      "Sitio Web",
      COMPANY_WEBSITE,
      colLeftX,
      contactYLeft,
      110
    );

    let contactYRight = 40;
    renderIcon(iconMail, colRightX, contactYRight, "✉");
    // Email: intentar que no se parta (shrinkSingleLine) para reducir altura y subir ubicación
    contactYRight = printLabelValue(
      "Email",
      COMPANY_EMAIL,
      colRightX,
      contactYRight,
      130,
      { shrinkSingleLine: true }
    );
    renderIcon(iconLoc, colRightX, contactYRight, "⌖");
    // Ubicación: permitir stack si es muy larga (pero normalmente cabe)
    contactYRight = printLabelValue(
      "Ubicación",
      COMPANY_ADDRESS,
      colRightX,
      contactYRight,
      130,
      { stackBelow: false }
    );

    // Ajustar cinta y título si el bloque creció mucho
    const headerBottom = Math.max(contactYLeft, contactYRight);
    const titleBaseY = headerBottom + 10; // mover la cinta debajo del bloque

    // Reposicionar el título y cinta (sobrescribiendo la versión previa)
    // Limpiar área original (opcional: se deja tal cual porque aún no se había dibujado la cinta en este punto)

    // Encabezado principal (COTIZACIÓN) reubicado más a la derecha y alineado con la fila de datos
    // Se dibuja después de calcular titleBaseY para evitar que obstruya el bloque de contacto.

    // Cinta / barra de asunto (tomada del título/nombre de la orden)
    // Generar título dinámico: usa orden.nombre si existe, si no toma primer producto.
    let tituloCotizacion = "COTIZACIÓN";
    if (orden.nombre && String(orden.nombre).trim().length > 0) {
      tituloCotizacion = String(orden.nombre).trim();
    } else if (
      productosOrden[0] &&
      productosOrden[0].Producto &&
      productosOrden[0].Producto.nombre
    ) {
      tituloCotizacion = `SUMINISTRO Y COLOCACIÓN DE ${productosOrden[0].Producto.nombre}`;
    }
    tituloCotizacion = tituloCotizacion.toUpperCase();
    const titleBoxWidth = 300;
    let titleFontSize = 12;
    doc.font("Helvetica-Bold").fontSize(titleFontSize);
    if (doc.widthOfString(tituloCotizacion) > titleBoxWidth) {
      while (
        titleFontSize > 8 &&
        doc.widthOfString(tituloCotizacion) > titleBoxWidth
      ) {
        titleFontSize -= 1;
        doc.fontSize(titleFontSize);
      }
      if (doc.widthOfString(tituloCotizacion) > titleBoxWidth) {
        tituloCotizacion = truncateToWidth(
          tituloCotizacion,
          titleBoxWidth,
          titleFontSize,
          "Helvetica-Bold"
        );
      }
    }
    doc.rect(40, titleBaseY, 300, 26).fill(colorGuinda).stroke(); // ligeramente más estrecha
    doc
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .fontSize(titleFontSize)
      .text(tituloCotizacion, 50, titleBaseY + 6, { width: 280 });
    // Badge "DATOS" a la derecha (reposicionado)
    const badgeX = 350;
    doc.fillColor(colorGuinda).rect(badgeX, titleBaseY, 70, 20).fill();
    doc
      .fillColor("#FFFFFF")
      .fontSize(10)
      .text("DATOS", badgeX, titleBaseY + 4, { width: 70, align: "center" });
    // Título superior derecho "COTIZACIÓN" más pequeño y en la parte alta para no obstruir
    doc
      .fillColor("#000000")
      .font("Helvetica-Bold")
      .fontSize(18)
      .text("COTIZACIÓN", 0, 20, { align: "right" });
    doc.fillColor("#000000");

    // Datos clave folio / vendedor / fecha
    // Reorganizar: a la izquierda FOLIO/VENDEDOR/FECHA; a la derecha (bajo "DATOS") bloque del cliente
    const metaY = titleBaseY + 28; // ligeramente más cerca del ribbon
    // Ajuste de columnas: vendedor un poco más a la izquierda y fecha más a la derecha
    const col1X = 40;
    const col2X = 145;
    const col3X = 305;
    const valOffset = 55;
    // Fila izquierda (coincide con la referencia)
    doc.fontSize(10).fillColor("#555").text("FOLIO", col1X, metaY);
    doc
      .fontSize(11)
      .fillColor("#000")
      .text(`${orden.ID}`, col1X + valOffset, metaY);
    doc.fontSize(10).fillColor("#555").text("Vendedor", col2X, metaY);
    doc
      .fontSize(11)
      .fillColor("#000")
      .text(`${orden.Usuario.nombre}`, col2X + valOffset, metaY);
    doc.fontSize(10).fillColor("#555").text("Fecha", col3X, metaY);
    doc
      .fontSize(11)
      .fillColor("#000")
      .text(
        `${new Date(orden.fecha_creacion).toLocaleDateString("es-MX")}`,
        col3X + valOffset,
        metaY
      );

    // Bloque del cliente bajo "DATOS" en la columna derecha
    const clientBlockX = 430; // columna derecha
    const clientBlockW = 120;
    const nombreCliente = (
      orden.Cliente && orden.Cliente.nombre
        ? String(orden.Cliente.nombre)
        : "---"
    ).toUpperCase();
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor("#222")
      .text(nombreCliente, clientBlockX, titleBaseY + 2, {
        width: clientBlockW,
      });
    let clientY = doc.y;
    const dirCliente =
      orden.Cliente && orden.Cliente.direccion
        ? orden.Cliente.direccion
        : "---";
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#666")
      .text(dirCliente, clientBlockX, clientY + 2, { width: clientBlockW });
    clientY = doc.y;
    const rfcCliente =
      orden.Cliente && orden.Cliente.rfc ? orden.Cliente.rfc : "---";
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#666")
      .text(`RFC: ${rfcCliente}`, clientBlockX, clientY + 2, {
        width: clientBlockW,
      });
    const clientBlockBottom = doc.y;

    // Línea separadora: bajo el bloque más alto (izquierda o derecha)
    const sepY = Math.max(metaY + 40, clientBlockBottom + 6);
    doc
      .strokeColor("#CCCCCC")
      .lineWidth(1)
      .moveTo(40, sepY)
      .lineTo(560, sepY)
      .stroke();
    doc.moveDown(1);

    // Se omite el bloque original de cliente/vendedor porque ya se mostraron arriba.

    // --- DETALLES ---
    doc
      .fontSize(12)
      .fillColor("#000")
      .text("DETALLE DE PRODUCTOS", 40, doc.y + 8);
    const tableTop = doc.y + 20;
    // Encabezado con fondo guinda: Cantidad | Productos | Precio | Total
    doc.save();
    doc.fillColor(colorGuinda).rect(40, tableTop, 520, 20).fill();
    doc.fillColor("#FFFFFF").fontSize(10);
    const colCant = 50;
    const colProd = 130;
    const colPU = 410;
    const colTot = 490;
    doc.text("Cantidad", colCant, tableTop + 5, { width: 70 });
    doc.text("Productos", colProd, tableTop + 5, { width: 260 });
    doc.text("Precio", colPU, tableTop + 5, { width: 60, align: "right" });
    doc.text("Total", colTot, tableTop + 5, { width: 60, align: "right" });
    doc.restore();

    let yPosition = tableTop + 26;
    let totalM2 = 0;
    let subtotal = 0;

    // Iterar sobre los productos
    for (const item of productosOrden) {
      const producto = item.Producto;
      subtotal += parseFloat(item.subtotal || 0);

      if (item.tipo_medida === "m2") {
        totalM2 += parseFloat(item.cantidad_m2_calculada || 0);
      }

      doc.fontSize(10).fillColor("#000");
      const cantidad =
        item.tipo_medida === "piezas"
          ? item.cantidad_piezas_calculada
          : item.cantidad_m2_calculada;
      // Producto y descripción juntos (wrap dinámico)
      let nombreLinea = producto.nombre || "";
      if (item.descripcion) {
        nombreLinea += ` - ${item.descripcion}`;
      }
      const productColWidth = 280;
      doc.fontSize(10);
      const productHeight = doc.heightOfString(nombreLinea, {
        width: productColWidth,
      });
      const rowHeight = Math.max(20, productHeight);
      doc.text(cantidad.toFixed(2), colCant, yPosition, { width: 60 });
      doc.text(nombreLinea, colProd, yPosition, { width: productColWidth });
      doc.text(
        `$${parseFloat(item.precio_unitario || 0).toFixed(2)}`,
        colPU,
        yPosition,
        { width: 60, align: "right" }
      );
      doc.text(
        `$${parseFloat(item.subtotal || 0).toFixed(2)}`,
        colTot,
        yPosition,
        { width: 60, align: "right" }
      );
      yPosition += rowHeight + 4;

      // Nueva página si es necesario
      if (yPosition > 700) {
        doc.addPage();
        const newTop = 50;
        // Redibujar encabezado de tabla
        doc.save();
        doc.fillColor(colorGuinda).rect(40, newTop, 520, 20).fill();
        doc.fillColor("#FFFFFF").fontSize(10);
        doc.text("Cantidad", colCant, newTop + 5, { width: 70 });
        doc.text("Productos", colProd, newTop + 5, { width: 260 });
        doc.text("Precio", colPU, newTop + 5, { width: 60, align: "right" });
        doc.text("Total", colTot, newTop + 5, { width: 60, align: "right" });
        doc.restore();
        yPosition = newTop + 26;
      }
    }

    // Bloque totales a la derecha y notas/bancos a la izquierda
    doc
      .strokeColor("#BBBBBB")
      .lineWidth(1)
      .moveTo(40, yPosition)
      .lineTo(560, yPosition)
      .stroke();
    yPosition += 10;

    const rightStart = yPosition;
    // Subtotal sin IVA (si existe campo en el modelo, usar orden.subtotal; si no, usamos subtotal acumulado)
    const subtotalBase = orden.subtotal ? parseFloat(orden.subtotal) : subtotal;
    let ivaMonto = 0;
    if (orden.incluir_iva) {
      ivaMonto = orden.iva
        ? parseFloat(orden.iva)
        : parseFloat((subtotalBase * 0.16).toFixed(2));
    }
    const totalFinal = parseFloat((subtotalBase + ivaMonto).toFixed(2));
    const saldoPendiente = totalFinal - parseFloat(orden.anticipo || 0);

    // Totales (caja)
    doc.fontSize(11).fillColor("#000");
    doc.text("Subtotal:", 390, rightStart, { width: 90 });
    doc.text(`$${subtotalBase.toFixed(2)}`, 470, rightStart, {
      width: 90,
      align: "right",
    });
    let lineY = rightStart + 15;
    if (orden.incluir_iva) {
      doc.text("IVA (16%):", 390, lineY, { width: 90 });
      doc.text(`$${ivaMonto.toFixed(2)}`, 470, lineY, {
        width: 90,
        align: "right",
      });
      lineY += 18;
    }
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Total:", 390, lineY, { width: 50 });
    doc.text(`$${totalFinal.toFixed(2)} MXN`, 470, lineY, {
      width: 90,
      align: "right",
    });
    lineY += 18;
    doc
      .fontSize(11)
      .fillColor("#006600")
      .font("Helvetica")
      .text("Anticipo:", 390, lineY, { width: 90 });
    doc.text(`$${parseFloat(orden.anticipo || 0).toFixed(2)}`, 470, lineY, {
      width: 90,
      align: "right",
    });
    lineY += 18;
    doc
      .fontSize(11)
      .fillColor("#CC0000")
      .text("Saldo Pend.:", 390, lineY, { width: 90 });
    doc.text(`$${saldoPendiente.toFixed(2)}`, 470, lineY, {
      width: 90,
      align: "right",
    });

    // Notas y datos bancarios
    const leftStart = rightStart;
    doc.fontSize(11).fillColor("#000").text("Método de pago:", 40, leftStart);
    doc
      .fontSize(10)
      .fillColor("#000")
      .text(
        "Efectivo, transferencia, tarjetas débito y crédito",
        40,
        leftStart + 14,
        { width: 320 }
      );
    let notesY = leftStart + 36;
    doc.fontSize(11).fillColor("#000").text("Notas:", 40, notesY);
    notesY += 14;
    doc
      .fontSize(10)
      .fillColor("#000")
      .text(
        `ANTICIPO: $${parseFloat(orden.anticipo || 0).toFixed(2)}`,
        40,
        notesY
      );
    notesY += 14;
    doc
      .fontSize(9)
      .fillColor("#444")
      .text("Cotización válida por 7 días.", 40, notesY, { width: 480 });
    notesY += 14;
    doc.fontSize(11).fillColor("#000").text("Datos Bancarios:", 40, notesY);
    notesY += 14;
    doc
      .fontSize(9)
      .fillColor("#000")
      .text("MÁRMOLES Y RECUBRIMIENTOS PETROARTE S.A.S. DE C.V.", 40, notesY, {
        width: 480,
      });
    notesY += 12;
    doc.fontSize(9).text("RFC: MRP-231024-SI7", 40, notesY, { width: 480 });
    notesY += 12;
    doc
      .fontSize(9)
      .text("Banco: SANTANDER ⎯ Cuenta: 6551080948", 40, notesY, {
        width: 480,
      });
    notesY += 12;
    doc
      .fontSize(9)
      .text("CLABE INTERBANCARIA: 014119656108094843", 40, notesY, {
        width: 480,
      });
    notesY += 12;
    doc
      .fontSize(9)
      .text("Email: marmolespetroarte@gmail.com", 40, notesY, { width: 480 });
    notesY += 16;
    doc
      .fontSize(8)
      .fillColor("#555")
      .text(
        "* COTIZACIÓN VÁLIDA ÚNICAMENTE DURANTE LOS PRÓXIMOS 7 DÍAS.",
        40,
        notesY,
        { width: 500 }
      );
    notesY += 10;
    doc
      .fontSize(8)
      .text(
        "* NO INCLUYE TRABAJOS DE ALBAÑILERÍA, PLAFÓN, ELECTRICIDAD, CARPINTERÍA, ETC.",
        40,
        notesY,
        { width: 500 }
      );
    notesY += 10;
    doc
      .fontSize(8)
      .text(
        "* ESTE PRESUPUESTO VARIARÁ SI SE HACEN REQUISICIONES EXTRA DURANTE LA INSTALACIÓN.",
        40,
        notesY,
        { width: 500 }
      );
    notesY += 10;
    doc
      .fontSize(8)
      .text(
        "* SOLICITAMOS GENTILMENTE EL 70% DE ANTICIPO, EL RESTO A CONTRA AVANCE DE LA OBRA O AVISO DE ENTREGA.",
        40,
        notesY,
        { width: 500 }
      );
    notesY += 10;
    doc
      .fontSize(8)
      .text(
        "* LOS PRODUCTOS CONTENIDOS EN ESTA COTIZACIÓN POR SER DE ORIGEN NATURAL TIENEN VARIACIÓN EN TONO, BETA Y BRILLO.",
        40,
        notesY,
        { width: 500 }
      );
    notesY += 18;
    yPosition = Math.max(lineY + 30, notesY);

    // --- PIE DE PÁGINA ---
    doc
      .fontSize(9)
      .fillColor("#666")
      .text(`Estado: ${orden.status.toUpperCase()}`, 40, yPosition);
    yPosition += 15;
    // Barra inferior guinda con lema
    const footerY = yPosition + 10;
    doc.save();
    doc.fillColor(colorGuinda).rect(40, footerY, 520, 18).fill();
    doc
      .fillColor("#FFFFFF")
      .fontSize(9)
      .text("La Piedra Natural Hecha Arte", 40, footerY + 4, {
        width: 520,
        align: "center",
      });
    doc.restore();

    // Finalizar el PDF
    doc.end();

    // Esperar a que termine de escribirse
    stream.on("finish", () => {
      // Enviar el archivo como descarga
      res.download(rutaArchivo, nombreArchivo, (err) => {
        if (err) {
          console.error("Error al enviar el archivo:", err);
          return res.status(500).json({
            success: false,
            message: "Error al descargar la factura",
          });
        }
        // Opcionalmente, eliminar el archivo después de enviarlo
        // fs.unlinkSync(rutaArchivo);
      });
    });

    stream.on("error", (error) => {
      console.error("Error al crear el PDF:", error);
      return res.status(500).json({
        success: false,
        message: "Error al generar la factura",
        error: error.message,
      });
    });
  } catch (error) {
    console.error("Error al generar factura:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor al generar factura",
      error: error.message,
    });
  }
};

// Agregar nuevo anticipo (sumando al existente)
// Obtener historial de anticipos de una orden
const obtenerHistorialAnticipos = async (req, res) => {
  try {
    const { id } = req.params;

    const historial = await HistorialAnticipos.findAll({
      where: { cotizacionId: id },
      include: [
        {
          model: Usuario,
          attributes: ["nombre", "correo"],
        },
      ],
      order: [["fecha", "DESC"]],
    });

    // Obtener la información de la orden
    const orden = await Cotizacion.findByPk(id);
    if (!orden) {
      return res.status(404).json({
        success: false,
        message: "Orden no encontrada",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        orden: {
          id: orden.ID,
          anticipo_total: parseFloat(orden.anticipo),
          total_orden: parseFloat(orden.total),
          saldo_pendiente: (
            parseFloat(orden.total) - parseFloat(orden.anticipo)
          ).toFixed(2),
        },
        historial: historial.map((h) => ({
          id: h.ID,
          monto: parseFloat(h.monto),
          fecha: h.fecha,
          tipo: h.tipo,
          usuario: h.Usuario.nombre,
          observaciones: h.observaciones,
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener historial de anticipos:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

const agregarAnticipo = async (req, res) => {
  try {
    const { id } = req.params;
    const { anticipo, ID_usuario, observaciones } = req.body;

    // Validar que venga el ID del usuario
    if (!ID_usuario) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID del usuario que registra el anticipo",
      });
    }

    // Validar que el anticipo sea un número válido
    if (anticipo === undefined || anticipo === null || isNaN(anticipo)) {
      return res.status(400).json({
        success: false,
        message: "El anticipo debe ser un número válido",
      });
    }

    // Validar que el anticipo no sea negativo
    if (anticipo < 0) {
      return res.status(400).json({
        success: false,
        message: "El anticipo no puede ser negativo",
      });
    }

    const orden = await Cotizacion.findByPk(id);

    if (!orden) {
      return res.status(404).json({
        success: false,
        message: "Orden no encontrada",
      });
    }

    // Sumar el nuevo anticipo al anticipo existente
    const anticipoActual = parseFloat(orden.anticipo) || 0;
    const nuevoAnticipo = anticipoActual + parseFloat(anticipo);

    // Validar que el anticipo total no sea mayor al total
    if (nuevoAnticipo > parseFloat(orden.total)) {
      return res.status(400).json({
        success: false,
        message: "El anticipo total no puede ser mayor al total de la orden",
      });
    }

    // Crear registro en el historial
    const registroHistorial = await HistorialAnticipos.create({
      cotizacionId: id,
      usuarioId: ID_usuario,
      monto: anticipo,
      tipo: "nuevo",
      observaciones: observaciones || null,
    });

    // Actualizar la orden
    orden.anticipo = nuevoAnticipo.toFixed(2);
    orden.fecha_ultimo_anticipo = registroHistorial.fecha;

    // Si el anticipo es igual al total, marcar como pagado
    if (parseFloat(orden.anticipo) >= parseFloat(orden.total)) {
      orden.status = "pagado";
    }

    await orden.save();

    // Obtener el historial actualizado
    const historialActualizado = await HistorialAnticipos.findAll({
      where: { cotizacionId: id },
      order: [["fecha", "DESC"]],
      include: [
        {
          model: Usuario,
          attributes: ["nombre", "correo"],
        },
      ],
    });

    return res.status(200).json({
      success: true,
      message: "Anticipo agregado exitosamente",
      data: {
        orden: {
          id: orden.ID,
          anticipo_total: parseFloat(orden.anticipo),
          anticipo_agregado: parseFloat(anticipo),
          total_orden: parseFloat(orden.total),
          saldo_pendiente: (parseFloat(orden.total) - nuevoAnticipo).toFixed(2),
          status: orden.status,
        },
        anticipo_registrado: {
          id: registroHistorial.ID,
          monto: parseFloat(registroHistorial.monto),
          fecha: registroHistorial.fecha,
          observaciones: registroHistorial.observaciones,
        },
        historial: historialActualizado.map((h) => ({
          id: h.ID,
          monto: parseFloat(h.monto),
          fecha: h.fecha,
          tipo: h.tipo,
          usuario: h.Usuario.nombre,
          observaciones: h.observaciones,
        })),
      },
    });
  } catch (error) {
    console.error("Error al agregar anticipo:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

module.exports = {
  crearOrden,
  obtenerOrdenes,
  obtenerOrdenPorId,
  actualizarOrden,
  actualizarStatusOrden,
  actualizarAnticipo,
  agregarAnticipo,
  obtenerHistorialAnticipos,
  calcularInventarioNecesario,
  confirmarInventario,
  listarResiduosDisponibles,
  generarFacturaPDF,
};
