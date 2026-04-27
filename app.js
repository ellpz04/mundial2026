// 1 - Invocamos a Express  Heroku
const express = require('express');
const app = express();

global.globalfolder = 1;
//console.log(globalfolder); // Output: "This can be accessed anywhere!"

//2 - Para poder capturar los datos del formulario (sin urlencoded nos devuelve "undefined")
app.use(express.urlencoded({extended:false}));
app.use(express.json());//además le decimos a express que vamos a usar json

//3- Invocamos a dotenv
const dotenv = require('dotenv');
dotenv.config({ path: './env/.env'});

//4 -seteamos el directorio de assets
app.use('/resources',express.static('public'));
app.use('/resources', express.static(__dirname + '/public'));

//5 - Establecemos el motor de plantillas
app.set('view engine','ejs');

//6 -Invocamos a bcrypt
//const bcrypt = require('bcryptjs');

//7- variables de session
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);


// 8 - Invocamos a la conexion de la DB
const connection = require('./database/db');
const {
	sendLoginNotification,
	getEmailConfigurationSummary,
	LOGIN_EMAIL_LOG_PATH
} = require('./services/loginEmailNotifier');

const sessionStore = new MySQLStore({
	clearExpired: true,
	checkExpirationInterval: 900000,
	expiration: 86400000,
	createDatabaseTable: true,
	schema: {
		tableName: 'sessions',
		columnNames: {
			session_id: 'session_id',
			expires: 'expires',
			data: 'data'
		}
	}
}, connection);

app.use(session({
	secret: process.env.SESSION_SECRET || 'secret',
	resave: false,
	saveUninitialized: false,
	store: sessionStore
}));

//console.log('[login-email] Configuracion cargada:', getEmailConfigurationSummary());
//console.log('[login-email] Archivo de log:', LOGIN_EMAIL_LOG_PATH);

function getClientIp(req) {
	const forwardedFor = req.headers['x-forwarded-for'];

	if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
		return forwardedFor.split(',')[0].trim();
	}

	if (req.socket && req.socket.remoteAddress) {
		return req.socket.remoteAddress;
	}

	return req.ip || 'desconocida';
}

function notifySuccessfulLogin(req, participant) {
	if (!participant) {
		return Promise.resolve({
			sent: false,
			skipped: true,
			reason: 'missing participant'
		});
	}

//	console.log('[login-email] Disparando notificacion para alias:', participant.Alias);

	return sendLoginNotification({
		alias: participant.Alias,
		name: participant.Nombre,
		email: participant.Correo,
		level: participant.Nivel,
		status: participant.Estatus,
		ipAddress: getClientIp(req),
		loggedAt: new Date()
	}).then((result) => {

//		console.log('[login-email] Resultado final:', result);

		return result;
	}).catch((error) => {
		console.error('[login-email] No se pudo enviar el correo de login:', error);
		return {
			sent: false,
			error: error.message
		};
	});
}

//10 - establecemos las rutas
	app.get('/acceso',(req, res)=>{
		res.render('acceso');
	})

app.get('/register',(req, res)=>{
		res.render('register');
	})

app.get('/test-login-email', async (req, res) => {
	if (!req.session.loggedin) {
		return res.status(401).json({
			ok: false,
			message: 'Debe iniciar sesion para probar el correo',
			logFile: LOGIN_EMAIL_LOG_PATH
		});
	}

	const result = await notifySuccessfulLogin(req, {
		Alias: req.session.Alias || 'test-login-email',
		Nombre: req.session.Alias || 'Usuario autenticado',
		Correo: process.env.SMTP_USER || 'sin-correo',
		Nivel: req.session.Nivel,
		Estatus: req.session.Estatus,
		Id_participante: req.session.Id_participante,
		Id_folder: req.session.Folder
	});

	return res.json({
		ok: true,
		result,
		config: getEmailConfigurationSummary(),
		logFile: LOGIN_EMAIL_LOG_PATH
	});
});

//puntos
app.get('/puntos', (req, res)=> {

	//	console.log('Debud ',req.session.loggedin);
	//	console.log('Debud ',req.session.Alias);
	
		if (req.session.loggedin) {
			res.render('puntos',{
				login: true,
				Alias: req.session.Alias,
				Nivel: req.session.Nivel,
				folder: req.body.Id_folder
			});		
		} else {
			res.render('puntos',{
				login:false,
				Alias:'Debe iniciar sesión',
				Nivel: '0'			
			});				
		}
		res.end();
	});

//puntos
app.get('/puntosC', (req, res)=> {

	//	console.log('Debud ',req.session.loggedin);
	//	console.log('Debud ',req.session.Alias);
	
		if (req.session.loggedin) {
			res.render('puntosC',{
				login: true,
				Alias: req.session.Alias,
				Nivel: req.session.Nivel,
				folder: req.body.Id_folder
			});		
		} else {
			res.render('puntosC',{
				login:false,
				Alias:'Debe iniciar sesión',
				Nivel: '0'			
			});				
		}
		res.end();
	});

//10 - Método para la REGISTRACIÓN
app.post('/register', async (req, res)=>{
	const user = req.body.user;
	const name = req.body.name;
    const rol = req.body.rol;
	const pass = req.body.pass;
	let passwordHash = await bcrypt.hash(pass, 8);
    connection.query('INSERT INTO users SET ?',{user:user, name:name, rol:rol, pass:passwordHash}, async (error, results)=>{
        if(error){
            console.log(error);
        }else{            
			res.render('register', {
				alert: true,
				alertTitle: "Registration",
				alertMessage: "¡Successful Registration!",
				alertIcon:'success',
				showConfirmButton: false,
				timer: 1500,
				ruta: ''
			});
            //res.redirect('/');         
        }
	});
})

//10 - Metodo para la autenticacion
app.post('/registra_save1', async (req, res)=> {
	const Alias = req.body.Alias;
	const pass = req.body.pass;    

    const Id_participante = req.body.Id_participante;
    const Id_folder = req.body.Id_folder;
    const Nombre = req.body.Nombre;
    const Contacto = req.body.Contacto;
    const Correo = req.body.Correo;

	console.log('El Alias es: ' + Alias);
	console.log('El pass  es: ' + pass);

	if (Alias && pass) {
		connection.query('SELECT * FROM participantes WHERE alias = ?', [Alias], async (error, results, fields)=> {

			if( results.length == 0  ) {  


				console.log({Correo:Correo, Nombre:Nombre,Contacto:Contacto});  
				

				connection.query('INSERT INTO participantes SET Nombre=?, Alias=?, Contacto=?, Correo=?, Pass= ?',[Nombre, Alias, Contacto, Correo, pass], (error, results)=>{
	
					if(error){
						console.log(error);
					}else{
//					   console.log(results);   

					    req.session.loggedin = false;

						console.log('Espere aviso de activación');

	console.log('Usuario registrado');
	res.render('acceso', {
		alert: true,
		alertTitle: "Espere aviso de activación",
		alertMessage: "¡USUARIO REGISTRADO!",
		alertIcon:'info',
		showConfirmButton: true,
		timer: false,
		ruta: 'acceso'
	}); 

			}
	});

			} else {         
				console.log('Usuario registrado');
				res.render('acceso', {
					alert: true,
					alertTitle: "Usuario registrado",
					alertMessage: "¡YA EXISTE USUARIO!",
					alertIcon:'success',
					showConfirmButton: false,
					timer: 1500,
					ruta: 'acceso'
				}); 
			}			
			//res.end();
		});

	} else {	
		res.render('acceso', {
			alert: true,
			alertTitle: "escriba usuario y contraseña",
			alertMessage: "Incompleto",
			alertIcon:'success',
			showConfirmButton: false,
			timer: 1500,
			ruta: ''
		}); 
	}
});

//11 - Metodo para la autenticacion
app.post('/auth', async (req, res)=> {
	const user = req.body.user;
	const pass = req.body.pass;    
//    let passwordHash = await bcrypt.hash(pass, 8);


	console.log('Accesa 0: ' + user);
//	console.log('El pass A es: ' + pass);

	if (user && pass) {
		connection.query('SELECT * FROM participantes WHERE alias = ?', [user], async (error, results, fields)=> {
			if (error) {
				console.log(error);
				res.render('acceso', {
                        alert: true,
                        alertTitle: "Error",
                        alertMessage: "NO SE PUDO VALIDAR EL ACCESO",
                        alertIcon:'error',
                        showConfirmButton: true,
                        timer: false,
                        ruta: 'acceso'    
                    });
				return;
			}

			if( results.length == 0  ) {  

				console.log('Usuario no registrado: ');

				res.render('acceso', {
                        alert: true,
                        alertTitle: "Error",
                        alertMessage: "USUARIO INCORRECTO!",
                        alertIcon:'error',
                        showConfirmButton: true,
                        timer: false,
                        ruta: 'acceso'    
                    });
				return;
							
			} else {
				const participant = results[0];
				const fin = Date.now();

				console.log(participant.Alias, 'Tiempo:', fin);

				if (pass != participant.Pass) {
					res.render('acceso', {
						alert: true,
						alertTitle: "Error",
						alertMessage: "Â¡CLAVE INCORRECTA!",
						alertIcon:'error',
						showConfirmButton: true,
						timer: false,
						ruta: 'acceso'
					});
					return;
				}

				const estatus = Number(participant.Estatus);
				const isActive = estatus === 1;

				if (isActive) {
					req.session.loggedin = true;
					req.session.Id_participante = participant.Id_participante;
					req.session.Alias = participant.Alias;
					req.session.Nivel = participant.Nivel;
					req.session.Estatus = participant.Estatus;
					req.session.Folder = participant.Id_folder;
				} else {
					console.log('Espere aviso de activaciÃ³n');
					req.session.loggedin = false;
					req.session.Id_participante = participant.Id_participante;
					req.session.Alias = participant.Alias;
					req.session.Nivel = participant.Nivel;
					req.session.Estatus = participant.Estatus;
					console.log('El app_aut Id es: ' + req.session.Id_participante);
					console.log('El usuario es: ' + req.session.Alias);
				}

				await notifySuccessfulLogin(req, participant);

				if (isActive) {
					res.render('acceso', {
						alert: true,
						alertTitle: "ConexiÃ³n exitosa",
						alertMessage: "Â¡LOGIN CORRECTO!",
						alertIcon:'success',
						showConfirmButton: false,
						timer: 1500,
						ruta: 'quinielaC'
					});
					return;
				}

				res.render('acceso', {
					alert: true,
					alertTitle: "Espere aviso de activaciÃ³n 1",
					alertMessage: "Â¡LOGIN CORRECTO!",
					alertIcon:'info',
					showConfirmButton: true,
					timer: false,
					ruta: ''
				});
				return;
/*
				//creamos una var de session y le asignamos true si INICIO SESSION     
//				console.log('Usuario registrado');

				results.forEach(element => {
//					console.log(pass);
//					console.log(element.Pass);

const fin = Date.now();

					console.log(element.Alias, 'Tiempo:', fin);
	
	 
					if (pass!=element.Pass) {
//						console.log('password diferente');

						res.render('acceso', {
							alert: true,
							alertTitle: "Error",
							alertMessage: "¡CLAVE INCORRECTA!",
							alertIcon:'error',
							showConfirmButton: true,
							timer: false,
							ruta: 'acceso'    
						});

					} else {
//						console.log('password igual');
//						console.log(element.Nivel);
						const Nivel = element.Nivel; 
						const Estatus = element.Estatus;
						const Alias = element.Alias;

							if( Estatus == 1  ) {  

//								console.log('usuario activo ',Alias);

								req.session.loggedin = true;                
								req.session.Id_participante = results[0].Id_participante;
								req.session.Alias = results[0].Alias;
								req.session.Nivel = results[0].Nivel;
								req.session.Estatus = results[0].Estatus;
								req.session.Folder = results[0].Id_folder;
				
//								console.log('El app_aut Id es: ' + req.session.Id_participante);
//								console.log('El usuario es: ' + req.session.Alias);
//								console.log('El Nivel es: ' + req.session.Nivel);
//								console.log('El Estatus es: ' + req.session.Estatus);

//                                console.log('El Nivel es: ' + req.session.Nivel);
//								console.log('El Folder es: ' + req.session.Folder);


								res.render('acceso', {
									alert: true,
									alertTitle: "Conexión exitosa",
									alertMessage: "¡LOGIN CORRECTO!",
									alertIcon:'success',
									showConfirmButton: false,
									timer: 1500,
									ruta: 'quinielaC'
								});  
								notifySuccessfulLogin(req, element);
		
							} else {
		
								console.log('Espere aviso de activación');

								req.session.loggedin = false;                
								req.session.Id_participante = results[0].Id_participante;
								req.session.Alias = results[0].Alias;
								req.session.Nivel = results[0].Nivel;
								req.session.Estatus = results[0].Estatus;
				
								console.log('El app_aut Id es: ' + req.session.Id_participante);
								console.log('El usuario es: ' + req.session.Alias);
//								console.log('El Nivel es: ' + req.session.Nivel);
//								console.log('El Estatus es: ' + req.session.Estatus);

								res.render('acceso', {
									alert: true,
									alertTitle: "Espere aviso de activación 1",
									alertMessage: "¡LOGIN CORRECTO!",
									alertIcon:'info',
									showConfirmButton: true,
									timer: false,
									ruta: ''
								});  
								notifySuccessfulLogin(req, element);
							}                                   
						  };
				});				
					
*/
			}			
			res.end();
		});


	} else {	
		res.send('Please enter user and Password!');
		res.end();
	}
});

//12 - Método para controlar que está auth en todas las páginas
app.get('/', (req, res)=> {

	console.log('Folder Usr ',globalfolder);

	if (req.session.loggedin) {
		res.render('calendario',{
			login: true,
			name: req.session.name			
		});		
	} else {
		res.render('calendario',{
			login:false,
			name:'Debe iniciar sesión',			
		});				 
	}
	res.end();
});

app.get('/famL', (req, res)=> {

	
	globalfolder = 1;
    //console.log(globalfolder); 

	if (req.session.loggedin) {
		res.render('ranking',{
			login: true,
			name: req.session.name,
			folder: 1			
		});		
	} else {
		res.render('ranking',{
			login:false,
			name:'Debe iniciar sesión',	
			folder: 1		
		});				 
	}
	res.end();
});

app.get('/garcia', (req, res)=> {

	globalfolder = 2;
    //console.log(globalfolder); 
	console.log(req.session.loggedin);

	if (req.session.loggedin) {
		res.render('ranking',{
			login: true,
			name: req.session.name,			
		});		
	} else {
		res.render('ranking',{
			login:false,
			name:'Debe iniciar sesión',	
			folder: 2		
		});				 
	}
	res.end();
});


app.get('/ranking', (req, res)=> {

	console.log(globalfolder); 

	if( globalfolder == 0  ) {  
		console.log(globalfolder); 
		res.render('resultados',{
			login: true,
			name: req.session.name,			
		});	
	} else {	
		console.log(globalfolder); 
		res.render('ranking',{
			login: true,
			name: req.session.name,			
		});	
	}


	res.end();
});

//función para limpiar la caché luego del logout
app.use(function(req, res, next) {
    if (!req.user)
        res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    next();
});

//Destruye la sesión.
app.get('/salir', function (req, res) {
	req.session.destroy(() => {
	  res.redirect('/acceso') // siempre se ejecutará después de que se destruya la sesión
	})
});
 
//compara
app.get('/compara', (req, res)=> {

//	console.log('Debud ',req.session.loggedin);
//	console.log('Debud ',req.session.Alias);

	if (req.session.loggedin) {
		res.render('compara',{
			login: true,
			Alias: req.session.Alias,
			Folder: req.session.Folder,
		
		});		
	} else {
		res.render('compara',{
			login:false,
			Alias:'Debe iniciar sesión',			
		});				
	}
	res.end();
});

//partidos
app.get('/partidos', (req, res)=> {

//	console.log('Debud ',req.session.loggedin);
//	console.log('Debud ',req.session.Alias);

	if (req.session.loggedin) {
		res.render('partidos',{
			login: true,
			Alias: req.session.Alias,
			Nivel: req.session.Nivel		
		});		
	} else {
		res.render('partidos',{
			login:false,
			Alias:'Debe iniciar sesión',
			Nivel: '0'			
		});				
	}
	res.end();
});

//quiniela 16
app.get('/quiniela', (req, res)=> {

//	console.log('Debug Q ',req.session.loggedin);
//	console.log('Debug Q ',req.session.Alias);
//	console.log('Debug Q ',req.session.Id_participante);

	if (req.session.loggedin) {
		res.render('quiniela',{
			login: true,
			Alias: req.session.Alias,
			Id_participante: req.session.Id_participante,
			Estatus: req.session.Estatus
		});
	} else {
		res.render('quiniela',{
			login:false,
			Alias:'Debe iniciar sesión',
		});
	}
	res.end();
});


//quinielaC
app.get('/quinielaC', (req, res)=> {

	//	console.log('Debug Q ',req.session.loggedin);
	//	console.log('Debug Q ',req.session.Alias);
	//	console.log('Debug Q ',req.session.Id_participante);
	
		if (req.session.loggedin) {
			res.render('quinielaC',{
				login: true,
				Alias: req.session.Alias,
				Nivel: req.session.Nivel,
				Id_participante: req.session.Id_participante,
				Folder: req.session.Folder,
			});
		} else {
			res.render('quinielaC',{
				login:false,
				Alias:'Debe iniciar sesión',
			});
		}
		res.end();
	});

//Campeon
app.get('/campeon', (req, res)=> {

	//	console.log('Debug Q ',req.session.loggedin);
	//	console.log('Debug Q ',req.session.Alias);
	//	console.log('Debug Q ',req.session.Id_participante);
	
		if (req.session.loggedin) {
			res.render('resultados',{
				login: true,
				Alias: req.session.Alias,
				Nivel: req.session.Nivel,
				Id_participante: req.session.Id_participante,
				Folder: req.session.Folder,
			});
		} else {
			res.render('resultados',{
				login:false,
				Alias:'Debe iniciar sesión',
			});
		}
		res.end();
	});
	

//RUTA para puntos 
app.get('/puntosC', (req,res)=>{

	//	console.log('Debug Q ',req.session.loggedin);
	//	console.log('Debug Q ',req.session.Alias);
	//	console.log('Debug Q ',req.session.Id_participante);
	
	if (req.session.loggedin) {
		res.render('puntosC',{
			login: true,
			Alias: req.session.Alias,
			Nivel: req.session.Nivel,
			Id_participante: req.session.Id_participante
		});
	} else {
		res.render('puntosC',{
			login:false,
			Alias:'Debe iniciar sesión',
		});
	}
	res.end();
});

//RUTA para regresiva
app.get('/participantes', (req,res)=>{

	//	console.log('Debug Q ',req.session.loggedin);
	//	console.log('Debug Q ',req.session.Alias);
	//	console.log('Debug Q ',req.session.Id_participante);
	
	if (req.session.loggedin) {
		res.render('participantes',{
			login: true,
			Alias: req.session.Alias,
			Nivel: req.session.Nivel,
			Id_participante: req.session.Id_participante
		});
	} else {
		res.render('participantes',{
			login:false,
			Alias:'Debe iniciar sesión', 
		});
	}
	res.end();
});

app.get('/participantes2', (req,res)=>{

	//	console.log('Debug Q ',req.session.loggedin);
	//	console.log('Debug Q ',req.session.Alias);
	//	console.log('Debug Q ',req.session.Id_participante);
	
	if (req.session.loggedin) {
		res.render('participantes2',{
			login: true,
			Alias: req.session.Alias,
			Nivel: req.session.Nivel,
			Id_participante: req.session.Id_participante
		});
	} else {
		res.render('participantes2',{
			login:false,
			Alias:'Debe iniciar sesión', 
		});
	}
	res.end();
});

 
app.use('/', require('./router'));

//const port = process.env.PORT

//	app.listen(port, () => {
//    console.log(`Server Running on port: ${port}`);
//    });

//app.listen(port || 3000)
//console.log(`Servidor ejecutando desde el puerto`, port || 3000);


//Local
// app.listen(4000, (req, res)=>{
//    console.log('SERVER RUNNING IN http://localhost:4000');
//}); 

//rawly
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor en puerto ${PORT}`);
});
