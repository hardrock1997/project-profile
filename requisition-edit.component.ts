import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { MatDialog } from '@angular/material';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { Observable, forkJoin, from, of, BehaviorSubject } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { Location } from '@angular/common';
import { DatePipe } from '@angular/common';
import { AngularEditorConfig } from '@kolkov/angular-editor';
//Service
import { RequisitionService } from '../_core/services/index';
import { SubheaderService } from '../../../../../core/services/layout/subheader.service';
import { LayoutUtilsService, MessageType } from '../../../_shared/utils/layout-utils.service';
import { ActivityMessengerService } from '../../../../../core/services/activity-messenger.service';
//User Access Role Service
import { UserAccessRolesService } from '../../../../../config/user-access-roles.service';
//Model
import { RequisitionModel } from '../_core/models/requisition.model';
//Get FromGroup Name
import { FormComponent } from '../../../guard/prevent-unsaved-changes-guard.guard';
import { CandidateService } from '../../candidate/_core/services';

@Component({
	selector: 'm-requisition-edit',
	templateUrl: './requisition-edit.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RequisitionEditComponent implements OnInit, FormComponent {
	requisition: RequisitionModel;
	loadingSubject = new BehaviorSubject<boolean>(false);
	loading$ = this.loadingSubject.asObservable();
	requisitionForm: FormGroup;
	hasFormErrors: boolean = false;
	clearance: string[] = ['N/A', 'Secret', 'Top Secret', 'TS/SCI', 'Other'];
	category: any[] = [];
	projectProfile: any[] = [];
	error: any = { isError: false, errorMessage: '' };
	viewMode: boolean = false;
	reqStatus: string = null;
	projectCustomeFields: Array<any> = [];
	approveManageDetails: any = {};
	requestManageDetails: any = {};
	ProjectCustomId: number = 0;
	selectedCat: number = 0;
	candidateCV: string = null;
	selectedFileName: string = null;
	fileData: Array<File> = [];
	fileTypes: Array<any> = ['txt', 'doc', 'docx', 'pdf', 'odt', 'rtf']; //acceptable file types
	projectFileList: Array<any> = [];
	readOnlyApprovingManager: boolean = false;
	readOnlyRequestingManager: boolean = false;
	readOnlyHiringManager: boolean = true;
	reqCandidates: Array<any> = [];
	preferredCand: Array<any> = [];
	prefCandidateJSON = {
		id: 0,
		req_id: 0,
		candiate_id: 0,
		detail:
		{
			"first_name": null,
			"last_name": null,
			"email": null,
			"phone": null,
			"id": 0,
			"resume": null,
			"s3_cv": null,
		},
	}

	altUsers: FormArray;
	preferredCandidates: FormArray;
	isDisabled: boolean = false;
	laborCategory: string = '';
	selClearanceOther: boolean = false;
	requisitionModel = new RequisitionModel();
	durationInMonth: Array<any> = [];
	duplicate: boolean = false;
	editMode: boolean = false;
	onSubmitClicked: boolean = false;
	updatedAt: any = null;
	eligibilityList: string[] = ['U.S. Citizenship',  'Permanent Resident/Green card', 'Foreign National'];
	editorConfig: AngularEditorConfig = {
		editable: true,
		spellcheck: true,
		height: '20rem',
		minHeight: '5rem',
		translate: 'no',
		uploadUrl: 'v1/images', // if needed
		customClasses: [ // optional
			{
				name: "quote",
				class: "quote",
			},
			{
				name: 'redText',
				class: 'redText'
			},
			{
				name: "titleText",
				class: "titleText",
				tag: "h1",
			},
		]
	};

	minDate: Date = new Date(Date.now() + (6.04e+8 * 3)); // added 3 weeks from current date
	today: Date = new Date();
	date: Date = new Date();
	endDateMin: Date = new Date(this.date.setMonth(this.date.getMonth() + 1));
	projectCategoryProfileDeleted: Boolean = false;

	constructor(private activatedRoute: ActivatedRoute,
		private router: Router,
		private requisitionsService: RequisitionService,
		private requisitionFB: FormBuilder,
		public dialog: MatDialog,
		private subheaderService: SubheaderService,
		private layoutUtilsService: LayoutUtilsService,
		private cdr: ChangeDetectorRef,
		private _location: Location,
		public datepipe: DatePipe,
		public activityMessengerService: ActivityMessengerService,
		public accessRoles: UserAccessRolesService,
		private candidatesService: CandidateService,
	) {

		this.requisition = new RequisitionModel();
		if (!this.accessRoles.canEditRequisition()) {
			this.goBack(0, false);
		}

		this.laborCategory = this.accessRoles.getProjectLaborCategory();
		for (let i = 1; i <= 36; i++) {
			this.durationInMonth.push(i);
		}
	}

	ngOnInit() {
		var __this = this;
		this.loadingSubject.next(true);
		this.initRequisition(0);
		__this.loadRequisitionForm();
		this.readOnlyRequestingManager = false;
	}

	loadRequisitionForm() {
		this.activatedRoute.queryParams.subscribe(async params => {
			const id = params.id;
			if (!this.accessRoles.canCreateRequisition() && !id) {
				this.goBack(0, true);
			}
			this.editMode = id ? true : false;
			if (params.duplicate) {
				this.duplicate = params.duplicate;
			}
			if (id && id > 0) {
				this.requisitionsService.getRequisitionById(id).subscribe(async res => {
					this.requisition = res.requisition;
					await this.getProjectProfile(this.requisition.project_id);
					await this.getProjectCustomFields(this.requisition.project_id);
					if (!this.duplicate && res.requisition.status == 'Approved') {
						if (!this.accessRoles.isAdmin()) {
							this.isDisabled = true;
							this.editorConfig.editable = false;
						}
					}
					this.initRequisition(id);
					this.mapValuesWithField(res.requisition);
					this.cdr.detectChanges();
				}, error => {
					const message = error.error.message;
					this.layoutUtilsService.showActionNotification(message, MessageType.Update, 10000, true, false);
				});
			} else {
				this.requisition = new RequisitionModel();
				/* Set Default Duration 24 Months
				 * based on startDate and selected duration set end date
				 */
				await this.getProjectProfile();
				await this.getProjectCustomFields();
				this.initRequisition(0);

				this.onSelectDurationOrStartDate(24, false); // 24 is a Default Months
				this.cdr.detectChanges();
			}
		});
	}
    /* Requisition Form Fileds Value Mapping With Form Control
	 * @ param  JSON Array
	 */
	mapValuesWithField(res) {
		/* Handling by fource input */
		/* check user want to create duplicate requisition,
		   then in case no redirect to view page
		*/
		if (!this.duplicate) { // no redirect in case of create duplicate requisition,otherwise checked requisition status and user details
			if (!(this.accessRoles.canEditRequisitionByUserId(res.stakeholders.createdBy.user_id) &&
				this.accessRoles.canEditRequisition() &&
				this.requisitionModel.isEditableRequisition(res.status))
			) {
				let _backUrl = 'requisitions/view?id=' + res.req_id;
				this.subheaderService.setBreadcrumbs(null);
				this.router.navigateByUrl(_backUrl);
			}
		}
		/* End */
		/* Title/Labor Category Based Value */
		if (res.projectProfile && !this.isProjectFreeText()) {	// Defined & Defined With Rate
			//Check Category/Profile is deleted
			this.isDeletedProjectCategoryProfile(res.project_id, res.projectProfile);
			if (this.duplicate)
				res.status = null;
			if ((this.projectCategoryProfileDeleted && res.status == 'Approved') || !this.projectCategoryProfileDeleted) {
				this.requisitionForm.controls['projectProfile'].patchValue(res.projectProfile.id);
				this.requisitionForm.controls['category'].setValue(res.projectProfile.category_id);
				this.requisitionForm.controls['categoryDeleted'].setValue(res.projectProfile.title);
			} else {
				this.requisitionForm.controls['projectProfile'].patchValue(null);
				this.requisitionForm.controls['category'].setValue(null);
			}
		} else {
			this.requisitionForm.controls['projectProfile'].patchValue(res.profile ? res.profile : '');
		}
		//Changes effected on browser
		this.cdr.detectChanges();
		this.requisitionForm.controls['showProfileNotFound'].patchValue(res.profile_not_found);
		this.requisitionForm.controls['reqId'].patchValue(res.req_id);

		if (res.min_rate && res.max_rate) {
			this.requisitionForm.controls['minRate'].patchValue(this.minMaxRateFixedTwoDecimal(res.min_rate));
			this.requisitionForm.controls['maxRate'].patchValue(this.minMaxRateFixedTwoDecimal(res.max_rate));
		} else if (res.projectProfile) {
			this.requisitionForm.controls['minRate'].patchValue(res.projectProfile.min_rate ? this.minMaxRateFixedTwoDecimal(res.projectProfile.min_rate) : '');
			this.requisitionForm.controls['maxRate'].patchValue(res.projectProfile.max_rate ? this.minMaxRateFixedTwoDecimal(res.projectProfile.max_rate) : '');
		}
		this.requisitionForm.controls['position'].patchValue(res.num_positions);

		if (res.clearance && res.clearance == 'Other') { // Added in case of Clearnce Others
			this.requisitionForm.controls['clearanceOther'].patchValue(res.clearance_other);
			this.selClearanceOther = true;
		}

		this.requisitionForm.controls['clearance'].patchValue(res.clearance);
		this.requisitionForm.controls['hours'].patchValue(res.weekly_hours);
		this.requisitionForm.controls['startDate'].patchValue(res.start_date);
		this.requisitionForm.controls['endDate'].patchValue(res.end_date);
		// Get Duration from start date to end date
		var duration = this.diffMonths(res.start_date, res.end_date);
		this.requisitionForm.controls['duration'].patchValue(duration);
		//Requesting manager
		if (res.requestingManager) {
			this.requisitionForm.controls['requestFirstName'].patchValue(res.requestingManager.first_name);
			this.requisitionForm.controls['requestLastName'].patchValue(res.requestingManager.last_name);
			this.requisitionForm.controls['requestEmail'].patchValue(res.requestingManager.email);
			this.requisitionForm.controls['requestPhone'].patchValue(res.requestingManager.phone);
			this.requisitionForm.controls['requestOrgDep'].patchValue(res.requestingManager.department);
			this.requisitionForm.controls['requestId'].patchValue(res.requestingManager.user_id);
		}
		/* Statement of Work */
		this.requisitionForm.controls['sowDescription'].patchValue(res.description);
		this.requisitionForm.controls['sowResponsibilities'].patchValue(res.responsibilities);
		this.requisitionForm.controls['sowSkills'].patchValue(res.required_skills);
		this.requisitionForm.controls['citizenShip'].patchValue(res.citizenship ? res.citizenship : ['U.S. Citizenship']);

		var __this = this;
		/* Preferred Candidate */
		//condition added to not populate details of preferred candidates while duplication of requisitions
		if (!this.duplicate && res.pref_candidates && res.pref_candidates.length > 0)
			__this.prefCandidateMapValues(res.pref_candidates);

		/* Custome Project Fields Mapping */
		if (res.req_params && res.req_params.length > 0)
			__this.customProjectFieldsMapValues(res.req_params);

		/* Selected candidate list of this requisitions */
		if (res.candidates && res.candidates.length > 0) {
			this.reqCandidates = res.candidates;
		} else {
			this.reqCandidates = [];
		}

		/* Approving Manager Fields Mapping */
		var ApprovingManager = res.req_user_roles.filter(function (obj) {
			return obj.role == 'AM';
		});
		if (ApprovingManager && ApprovingManager.length > 0) {
			this.requisitionForm.controls['approveFirstName'].patchValue(ApprovingManager[0].first_name ? ApprovingManager[0].first_name : null);
			this.requisitionForm.controls['approveLastName'].patchValue(ApprovingManager[0].last_name ? ApprovingManager[0].last_name : null);
			this.requisitionForm.controls['approveEmail'].patchValue(ApprovingManager[0].email ? ApprovingManager[0].email : null);
			this.requisitionForm.controls['approvePhone'].patchValue(ApprovingManager[0].phone ? ApprovingManager[0].phone : null);
			this.requisitionForm.controls['approveId'].patchValue(ApprovingManager[0].user_id ? ApprovingManager[0].user_id : null);
		}
		/* Alternate Candidate Fields Mapping */
		var AlterInfo = res.req_user_roles.filter(function (obj) {
			return obj.role == 'Alternate';
		});
		if (AlterInfo && AlterInfo.length > 0)
			__this.alternateCandMapValues(AlterInfo);
	}

	/* Preffered Candidate Fileds Value Mapping With Form Control
	 * @ param  JSON Array
	 */
	prefCandidateMapValues(prefCandList: any) {
		var __this = this;
		__this.preferredCandidates = __this.requisitionForm.get('preferredCandidates') as FormArray;
		prefCandList.forEach(function (obj, index) {
			if (index >= __this.preferredCandidates.length) {
				__this.preferredCandidates.push(__this.createPreferredCandidate(obj));
			} else {
				__this.preferredCandidates.at(index)['controls'].prefFirstName.patchValue(obj.detail.first_name ? obj.detail.first_name : null);
				__this.preferredCandidates.at(index)['controls'].prefLastName.patchValue(obj.detail.last_name ? obj.detail.last_name : null);
				__this.preferredCandidates.at(index)['controls'].prefEmail.patchValue(obj.detail.email ? obj.detail.email : null);
				__this.preferredCandidates.at(index)['controls'].prefPhone.patchValue(obj.detail.phone ? obj.detail.phone : null);
				__this.preferredCandidates.at(index)['controls'].prefId.patchValue(obj.id ? obj.id : null);
				__this.preferredCandidates.at(index)['controls'].prefCandId.patchValue(obj.candiate_id ? obj.candiate_id : null);
				__this.preferredCandidates.at(index)['controls'].prefCandDetailId.patchValue(obj.detail.id ? obj.detail.id : null);
				__this.preferredCandidates.at(index)['controls'].selectedFileName.patchValue(null);
				__this.preferredCandidates.at(index)['controls'].prefCandResume.patchValue(null);
				__this.preferredCandidates.at(index)['controls'].prefCandReqId.patchValue(obj.req_id ? obj.req_id : null);
				__this.preferredCandidates.at(index)['controls'].prefCandS3.patchValue(obj.detail.s3_cv ? obj.detail.s3_cv : null);
				__this.preferredCandidates.at(index)['controls'].prefCandResume.patchValue(null);
			}
		})
	}

	/* Custome Project Fileds Value Mapping With Form Control
	 * @ param  JSON Array
	 */
	customProjectFieldsMapValues(customProject: any) {
		var __this = this;
		for (var i = 0; i < this.projectCustomeFields.length; i++) {
			var fieldId = 'field_' + this.projectCustomeFields[i]['id'];
			var id = this.projectCustomeFields[i]['id'];
			/* Filter data from custome project array to show data in form */
			var result = customProject.filter(function (obj) {
				return obj.param_id == id;
			});
			if (this.projectCustomeFields[i]['type'] == "MultiSelect") {
				if (result && result.length > 0 && result[0].param_val != undefined && result[0].param_val != null) {
					var values = (result[0].param_val).split(",");
					this.requisitionForm.controls[fieldId].patchValue(values);
				}
			}
			else if (result.length > 0) {
				this.requisitionForm.controls[fieldId].patchValue(result[0].param_val);
			} else {
				this.requisitionForm.controls[fieldId].patchValue(null);
			}
		}
	}

	/* Alternate Candidate Fileds Value Mapping With Form Control
	 * @ param  JSON Array
	 */
	alternateCandMapValues(AlterInfo: any) {
		var __this = this;
		__this.altUsers = __this.requisitionForm.get('altUsers') as FormArray;
		AlterInfo.forEach(function (obj, index) {
			if (index >= __this.altUsers.length) {
				__this.altUsers.push(__this.createAltUser({ 'first_name': obj.first_name, 'last_name': obj.last_name, 'email': obj.email, 'phone': obj.phone }));
			} else {
				__this.altUsers.at(index)['controls'].altFirstName.patchValue(obj.first_name);
				__this.altUsers.at(index)['controls'].altLastName.patchValue(obj.last_name);
				__this.altUsers.at(index)['controls'].altEmail.patchValue(obj.email);
				if (obj.phone)
					__this.altUsers.at(index)['controls'].altPhone.patchValue(obj.phone);
			}
		})
	}

	initRequisition(req_id) {
		this.createForm();
		this.loadingSubject.next(false);
		if (req_id == 0) {
			this.subheaderService.setBreadcrumbs([
				{ title: 'Requisitions', page: '/requisitions' },
				{ title: 'New Requisition', page: '/requisitions/add' }
			]);
			return;
		}
		this.subheaderService.setTitle('Edit Requisition');
		this.subheaderService.setBreadcrumbs([
			{ title: 'Requisitions', page: '/requisitions' },
			{ title: 'Edit Requisition', page: '/requisitions/edit', queryParams: { id: req_id } }
		]);
	}

	formGroup() {
		return this.requisitionForm;
	}
	async getProjectCustomFields(projectId: number = 0) {
		let queryParams = null;
		if (projectId) {
			queryParams = {};
			queryParams['filter.project_id'] = projectId;
		}
		return new Promise((resolve, reject) => {
			this.requisitionsService.getProjectFields(queryParams).subscribe(response => {
				this.projectCustomeFields = response.fields;
				resolve();
			}, error => {
				console.error("Getting Custom Project Field", error);
				resolve();
			});
		});;
	}

	async getProjectProfile(projectId: number = 0) {
		var __this = this;
		let queryParams = null;
		if (projectId) {
			queryParams = {};
			queryParams['filter.project_id'] = projectId;
		}
		return new Promise((resolve, reject) => {
			this.requisitionsService.getProjectProfile(queryParams).subscribe(res => {
				if (!res.status) {
					this.projectProfile = [];
					resolve();
					return;
				}
				__this.projectProfile = res.results;
				if (__this.projectProfile.length > 0) {
					__this.projectProfile.forEach(function (obj) {
						if (obj.projectProfiles.length > 0) {
							obj.projectProfiles.forEach(function (obj2) {
								__this.projectFileList.push(obj2);
							});
						}
					});
				}
				resolve();
			}, error => {
				console.error("error getting project profiles", error);
				resolve();
			});
		});
	}

	onSelectCategory(val: any) {
		if (this.projectFileList.length > 0) {
			var projectProfileData = this.projectFileList.filter(function (obj) {
				return obj.id == val.value;
			});
			this.requisitionForm.controls['category'].patchValue(projectProfileData[0].category_id);
			if (projectProfileData.length > 0) {
				this.requisitionForm.controls['minRate'].patchValue(this.minMaxRateFixedTwoDecimal(projectProfileData[0].min_rate));
				this.requisitionForm.controls['maxRate'].patchValue(this.minMaxRateFixedTwoDecimal(projectProfileData[0].max_rate));
			} else {
				this.requisitionForm.controls['minRate'].patchValue('');
				this.requisitionForm.controls['maxRate'].patchValue('');
			}
		}
	}

	createForm() {
		var formObj = {
			/* New Requisition */
			reqId: [0],
			showProfileNotFound: [false],
			category: [0],
			projectProfile: [{ value: null, disabled: this.isDisabled }, [Validators.required, Validators.maxLength(255)]],
			minRate: [{ value: null, disabled: this.isDisabled }, [Validators.max(99999999), Validators.pattern(/^[0-9]+(\.[0-9]{1,2})?$/)]],
			maxRate: [{ value: null, disabled: this.isDisabled }, [Validators.max(99999999), Validators.pattern(/^[0-9]+(\.[0-9]{1,2})?$/)]],
			startDate: [{ value: new Date(Date.now() /*+ (6.04e+8 * 3)*/), disabled: this.isDisabled }, [Validators.required]], //3 weeks from today
			duration: [{ value: 24, disabled: this.isDisabled }, [Validators.required]],
			endDate: [{ value: null, disabled: this.isDisabled }, [Validators.required]],
			hours: [{ value: 40, disabled: this.isDisabled }, [Validators.required, Validators.pattern(/^-?(0|[1-9]\d*)?$/), Validators.required, Validators.min(1), Validators.max(50)]],
			position: [{ value: null, disabled: this.isDisabled }, [Validators.required, Validators.pattern(/^-?(0|[1-9]\d*)?$/), Validators.min(1), Validators.max(1000)]],
			clearance: ['N/A', [Validators.required]],
			clearanceOther: [null, Validators.maxLength(255)],
			citizenShip: [['U.S. Citizenship'], Validators.required],
			categoryDeleted: [{ value: null, disabled: true }],
			/* Requesting Manager */
			requestFirstName: [{ value: null, disabled: this.isDisabled }],
			requestLastName: [{ value: null, disabled: this.isDisabled }],
			requestEmail: [{ value: null, disabled: this.isDisabled }, [Validators.email]],
			requestPhone: [{ value: null, disabled: this.isDisabled }],
			requestOrgDep: [{ value: null, disabled: this.isDisabled }],
			requestId: [0],
			/* Approving Manager */
			approveFirstName: [{ value: null, disabled: this.isDisabled }],
			approveLastName: [{ value: null, disabled: this.isDisabled }],
			approveEmail: [{ value: null, disabled: this.isDisabled }, [Validators.email]],
			approvePhone: [{ value: null, disabled: this.isDisabled }],
			approveId: [0],
			/* Hiring Manager */
			/*hireFirstName:[null],
			hireLastName:[null],
			hireEmail:[null,[Validators.email]],
			hirePhone:[null],
			hireId:[0],*/
			/* Alternates */
			altUsers: this.requisitionFB.array([this.createAltUser({ 'first_name': null, 'last_name': null, 'email': null })]),
			/* Statement of Work */
			sowDescription: [{ value: null, disabled: this.isDisabled }],
			sowResponsibilities: [{ value: null, disabled: this.isDisabled }],
			sowSkills: [{ value: null, disabled: this.isDisabled }],
			/* Preferred Candidate */
			preferredCandidates: this.requisitionFB.array([this.createPreferredCandidate(this.prefCandidateJSON)]),
		};
		for (var i = 0; i < this.projectCustomeFields.length; i++) {
			/* Set Custom Fileds Validator */
			var validators: Array<any> = this.setCustomeFieldValidator(this.projectCustomeFields[i], true);
			var fieldId = 'field_' + this.projectCustomeFields[i]['id'];
			if (this.projectCustomeFields[i]['archived']) {
				formObj[fieldId] = [{ value: null, disabled: true }, validators];
			} else {
				formObj[fieldId] = [{ value: null, disabled: this.isDisabled }, validators];
			}
		}

		this.requisitionForm = this.requisitionFB.group(formObj);
	}

	/* Set Custom Fileds Validator */
	setCustomeFieldValidator(customFiled, setRequired = false) {
		var formControlValidator = [];
		if (customFiled['required'] && setRequired)
			formControlValidator.push(Validators.required);
		if (customFiled['type'] == 'Email')
			formControlValidator.push(Validators.email);
		if (customFiled['type'] == 'Text' || customFiled['type'] == 'Email')
			formControlValidator.push(Validators.maxLength(255));
		if (customFiled['type'] == 'TextArea')
			formControlValidator.push(Validators.maxLength(512));
		if (customFiled['type'] == 'Number') {
			formControlValidator.push(Validators.pattern(/^(?:[0-9]+(?:\.[0-9]{0,3})?)?$/));
			formControlValidator.push(Validators.maxLength(12));
		}
		return formControlValidator;
	}

	/* Set required Validation On Save Button Click */
	setCustomeFieldRequiredValidator() {
		for (var i = 0; i < this.projectCustomeFields.length; i++) {
			var validators: Array<any> = this.setCustomeFieldValidator(this.projectCustomeFields[i], true);
			var fieldId = 'field_' + this.projectCustomeFields[i]['id'];
			const customField = this.requisitionForm.get(fieldId);
			customField.setValidators(validators);
			customField.updateValueAndValidity();
		}
	}

	/* Remove required Validation On saveAsDraft Button Click */
	removeCustomeFieldRequiredValidator() {
		for (var i = 0; i < this.projectCustomeFields.length; i++) {
			var validators: Array<any> = this.setCustomeFieldValidator(this.projectCustomeFields[i], false);
			var fieldId = 'field_' + this.projectCustomeFields[i]['id'];
			const customField = this.requisitionForm.get(fieldId);
			customField.setValidators(validators);
			customField.updateValueAndValidity();
		}
	}

	removeStartdateValidator() {
		this.requisitionForm.get('startDate').setValidators([]);
		this.requisitionForm.get('startDate').updateValueAndValidity();
	}

	/* Create Alternate User */
	createAltUser(data: any): FormGroup {
		return this.requisitionFB.group({
			altFirstName: [data.first_name, []],
			altLastName: [data.last_name, []],
			altEmail: [data.email, [Validators.email]],
			altPhone: [data.phone, []],
		});
	}

	addAltUser(): void {
		this.altUsers = this.requisitionForm.get('altUsers') as FormArray;
		this.altUsers.push(this.createAltUser({ 'first_name': null, 'last_name': null, 'email': null, 'phone': null }));
	}

	removeAltUser(index) {
		this.altUsers = this.requisitionForm.get('altUsers') as FormArray;
		this.altUsers.removeAt(index);
	}

	getAltUsers(): FormArray {
		return <FormArray>this.requisitionForm.controls.altUsers;
	}
	/* End Alternate user details */

	/* Create Preferred Candidate*/
	createPreferredCandidate(prefCandData: any): FormGroup {
		return this.requisitionFB.group({
			prefFirstName: [prefCandData.detail.first_name, []],
			prefLastName: [prefCandData.detail.last_name, []],
			prefEmail: [prefCandData.detail.email, [Validators.email]],
			prefPhone: [prefCandData.detail.phone, []],
			prefId: [prefCandData.id],
			prefCandId: [prefCandData.candiate_id],
			prefCandDetailId: [prefCandData.detail.id],
			selectedFileName: [null],
			prefCandResume: [null],
			prefCandReqId: [prefCandData.req_id],
			prefCandS3: [prefCandData.detail.s3_cv],
		});
	}

	addPreferredCandidate(): void {
		this.preferredCandidates = this.requisitionForm.get('preferredCandidates') as FormArray;
		this.preferredCandidates.push(this.createPreferredCandidate(this.prefCandidateJSON));
	}

	removePreferredCandidate(index) {
		this.preferredCandidates = this.requisitionForm.get('preferredCandidates') as FormArray;
		this.preferredCandidates.removeAt(index);
	}

	getPreferredCandidate(): FormArray {
		return <FormArray>this.requisitionForm.controls.preferredCandidates;
	}
	/* End Preferred candidate details */

	goBack(id = 0, withBack: boolean = false) {
		var _backUrl = 'requisitions';
		if (id > 0 && !withBack) {
			_backUrl += '/edit?id=' + id;
			this.router.navigateByUrl(_backUrl);
		} else if ((id > 0 && withBack) || this.requisition.req_id > 0) {
			this.router.navigateByUrl(_backUrl);
		} else {
			this._location.back();
		}
		/*if(this.duplicate){
			this.router.navigateByUrl(_backUrl);
		}*/
	}

	onSubmit(withBack: boolean = false) {
		console.log("--fgfg--");
		this.setFieldsValidators('request');
		this.onSubmitClicked = true;
		this.setCustomeFieldRequiredValidator();
		/* Reset/Set Min/Max Rate Validation & Check Value */
		this.resetMinMaxValueValidator();// Reset Default Validation
		this.minMaxValueValidator();

		this.hasFormErrors = false;
		this.error = { isError: false, errorMessage: "" };
		let __this = this;
		// Validate Preferred candidate and Alternate candidates fields
		let formKeys = ['preferredCandidates','altUsers'];
		formKeys.map(function(obj){
			let firstNameKey = 'prefFirstName';
			let lastNameKey = 'prefLastName';
			let emailKey = 'prefEmail';
			let phoneKey = 'prefPhone';
			if(obj == 'altUsers') {
				firstNameKey = 'altFirstName';
				lastNameKey = 'altLastName';
				emailKey = 'altEmail';
				phoneKey = 'altPhone';
			}
			let users = __this.requisitionForm.get(obj) as FormArray;
			for(let i = 0; i < users.length; i++){
				let formEmailVal = (users['value'][i][emailKey])?users['value'][i][emailKey].trim():users['value'][i][emailKey];
				let formFnameVal = (users['value'][i][firstNameKey])?users['value'][i][firstNameKey].trim():users['value'][i][firstNameKey];
				let formLnameVal = (users['value'][i][lastNameKey])?users['value'][i][lastNameKey].trim():users['value'][i][lastNameKey];
				let formPhoneVal = (users['value'][i][phoneKey])?users['value'][i][phoneKey].trim():users['value'][i][phoneKey];
				
				users.at(i)['controls'][firstNameKey].setValidators(null);
				users.at(i)['controls'][emailKey].setValidators(Validators.email);
				users.at(i)['controls'][firstNameKey].updateValueAndValidity();
				users.at(i)['controls'][emailKey].updateValueAndValidity();
				console.log("dfdf----before if "+obj, i);
				if (formEmailVal || formFnameVal || formLnameVal  || formPhoneVal) {
					users.at(i)['controls'][firstNameKey].setValidators([Validators.required]);
					users.at(i)['controls'][emailKey].setValidators([Validators.required,Validators.email]);
					users.at(i)['controls'][firstNameKey].updateValueAndValidity();
				    users.at(i)['controls'][emailKey].updateValueAndValidity();
					users.at(i)['controls'][emailKey].markAsTouched();
					users.at(i)['controls'][firstNameKey].markAsTouched();
					console.log("dfdf----after if "+obj, i);
					//Highlight errors if require field's value is blank or invalid.
					if(!formFnameVal) {
						users.at(i)['controls'][firstNameKey].patchValue("");
						__this.hasFormErrors = true;
					}
					if(!formEmailVal) {
						users.at(i)['controls'][emailKey].patchValue("");
						__this.hasFormErrors = true;
					} else if(!__this.isEmail(formEmailVal)){
						users.at(i)['controls'][emailKey].patchValue(formEmailVal);
						__this.hasFormErrors = true;
					}
				}
				
			}
		});
		if(__this.hasFormErrors)
		{
			this.requisitionForm.markAsPristine();
			return;
		}
		
		const controls = this.requisitionForm.controls;
		/** check form */
		if (this.requisitionForm.invalid) {
			Object.keys(controls).forEach(controlName =>
				controls[controlName].markAsTouched()
			);
			this.hasFormErrors = true;
			return;
		}

		/** check start date & end date **/
		if (!this.compareDates()) {
			this.hasFormErrors = true;
			return;
		}

		
		this.requisitionForm.markAsPristine();
		// tslint:disable-next-line:prefer-const
		let editedRequisition = this.prepareRequisition();

		if (editedRequisition.req_id > 0 && !this.duplicate) {
			this.updateRequisition(editedRequisition, withBack);
			return;
		}
		this.addRequisition(editedRequisition, withBack);
	}

	onSubmitDraft(withBack: boolean = false) {
		this.resetMinMaxValueValidator();// Reset Default Validation
		this.removeFieldsValidators('request');
		this.removeCustomeFieldRequiredValidator();
		/* Reset/Set Min/Max Rate Validation & Check Value */
		this.minMaxValueValidator();
		this.hasFormErrors = false;
		this.error = { isError: false, errorMessage: "" };
		let __this = this;
		// 	Remove validations from Preferred candidate and Alternate candidates fields
		let formKeys = ['preferredCandidates','altUsers'];
		formKeys.map(function(obj){
			let firstNameKey = 'prefFirstName';
			let lastNameKey = 'prefLastName';
			let emailKey = 'prefEmail';
			let phoneKey = 'prefPhone';
			if(obj == 'altUsers') {
				firstNameKey = 'altFirstName';
				lastNameKey = 'altLastName';
				emailKey = 'altEmail';
				phoneKey = 'altPhone';
			}
			let users = __this.requisitionForm.get(obj) as FormArray;
			for(let i = 0; i < users.length; i++){
				users.at(i)['controls'][firstNameKey].setValidators(null);
				users.at(i)['controls'][emailKey].setValidators(Validators.email);
				users.at(i)['controls'][firstNameKey].updateValueAndValidity();
				users.at(i)['controls'][emailKey].updateValueAndValidity();
			}
		});
		const controls = this.requisitionForm.controls;
		/** check form */
		if (this.requisitionForm.invalid) {
			Object.keys(controls).forEach(controlName =>
				controls[controlName].markAsTouched()
			);
			this.hasFormErrors = true;
			return;
		}

		/** check start date & end date **/
		if (!this.compareDates()) {
			this.hasFormErrors = true;
			return;
		}
		
		this.requisitionForm.markAsPristine();
		let editedRequisition = this.prepareRequisition();
		editedRequisition['saveAsDraft'] = true;
		if (editedRequisition.req_id > 0 && !this.duplicate) {
			this.updateRequisition(editedRequisition, withBack);
			return;
		}
		this.addRequisition(editedRequisition, withBack);
	}

	onSaveByAdmin() {
		if (!this.editMode) {
			return false;
		}
		this.removeStartdateValidator();
		if (this.requisition.status === 'Draft') {
			this.onSubmitDraft(false);
		} else {
			this.onSubmit(false);
		}
	}

	compareDates() {
		if (new Date(this.requisitionForm.controls['endDate'].value) < new Date(this.requisitionForm.controls['startDate'].value)) {
			this.error = { isError: true, errorMessage: "End Date can't before start date" };
			return false;
		} else {
			return true;
		}
	}

	prepareRequisition(): RequisitionModel {
		const controls = this.requisitionForm.controls;
		const _requisition = new RequisitionModel();
		_requisition._isNew = this.requisition.req_id > 0 ? false : true;
		_requisition._isUpdated = this.requisition.req_id > 0 ? true : false;
		var reqUserRoles: Array<any> = [];
		var __this = this;
		/*push Preferred candidate details in array */
		var prefCandData = this.getPreferredCandidate();
		this.preferredCand = prefCandData.controls
			.filter(formGroup => (formGroup.value.prefFirstName && formGroup.value.prefEmail))
			.map(formGroup => ({
				id: formGroup.value.prefId,
				req_id: controls['reqId'].value,
				candiate_id: formGroup.value.prefCandId,
				detail:
				{
					"first_name": formGroup.value.prefFirstName,
					"last_name": formGroup.value.prefLastName,
					"email": formGroup.value.prefEmail,
					"phone": formGroup.value.prefPhone,
					"id": this.duplicate ? 0 : formGroup.value.prefCandDetailId,
					"resume": formGroup.value.selectedFileName
				},
			}));

		/*push Alt user details in array */
		var altUserData = this.getAltUsers();
		for (const formGroup of altUserData.controls) {
			if (formGroup.value.altFirstName && formGroup.value.altEmail)
				reqUserRoles.push({
					"first_name": formGroup.value.altFirstName,
					"last_name": formGroup.value.altLastName,
					"email": formGroup.value.altEmail,
					"phone": formGroup.value.altPhone,
					"role": "Alternate",
				});
		}

		/*push Approval user details in array if email entered */
		if (controls['approveEmail'].value) {
			reqUserRoles.push({
				"first_name": controls['approveFirstName'].value,
				"last_name": controls['approveLastName'].value,
				"email": controls['approveEmail'].value,
				"phone": controls['approvePhone'].value,
				"user_id": controls['approveId'].value,
				"role": "AM",
			});
		}

		/*push Hire user details in array if email entered */
		/*if(controls['hireFirstName'].value){
			reqUserRoles.push({
            	"first_name":controls['hireFirstName'].value,
				"last_name": controls['hireLastName'].value,
				"email": controls['hireEmail'].value,
				"phone": controls['hirePhone'].value,
				"user_id": controls['hireId'].value,
				"role":"HA",
            });
		}*/

		/* Push & Validate Requestor Manager Details */
		var requestorManager: any = null;
		if (controls['requestEmail'].value && controls['requestFirstName'].value) {

			requestorManager = {
				"first_name": controls['requestFirstName'].value,
				"last_name": controls['requestLastName'].value,
				"email": controls['requestEmail'].value,
				"phone": controls['requestPhone'].value,
				"department": controls['requestOrgDep'].value,
				"id": controls['requestId'].value,
			};

		}

		/* Push in array custom project fileds */
		let customeProjects: Array<any> = [];
		if (this.projectCustomeFields.length) {
			this.projectCustomeFields.forEach(function (obj) {
				var fieldName = 'field_' + obj.id;
				if (!(__this.duplicate && (__this.requisition.status == "Rejected" || __this.requisition.status == "Cancelled") && obj.archived == true)) {
					if (controls[fieldName].value) { // get value by formControm Name,obj.name is field name
						if (obj.type == "MultiSelect") {
							customeProjects.push({
								'param_val': (controls[fieldName].value.toString()),
								'param_id': obj.id
							});
						} else {
							customeProjects.push({
								'param_val': controls[fieldName].value,
								'param_id': obj.id
							});
						}
					}
				}
			});
		}

		const create_requisition_new: any = {
			"project_id": this.accessRoles.getActiveProjectId(),
			"category_id": controls['category'].value,
			"num_positions": controls['position'].value,
			"weekly_hours": controls['hours'].value,
			"start_date": this.datepipe.transform(controls['startDate'].value, 'MM-dd-yyyy'),
			"end_date": this.datepipe.transform(controls['endDate'].value, 'MM-dd-yyyy'),
			"clearance": controls['clearance'].value,
			"clearance_other": controls['clearanceOther'].value,
			"citizenship": JSON.stringify(controls['citizenShip'].value),
			"created_by": this.accessRoles.getUserId(),
			"req_user_roles": reqUserRoles,
			"min_rate": controls['minRate'].value ? controls['minRate'].value : null,
			"max_rate": controls['maxRate'].value ? controls['maxRate'].value : null,
			/* Statement of Work */
			"description": controls['sowDescription'].value,
			"responsibilities": controls['sowResponsibilities'].value,
			"required_skills": controls['sowSkills'].value,
			/* Preferred Candidate */
			"pref_candidates": this.preferredCand,
			/* custom fields */
			"req_params": customeProjects,
		};

		/* Title/Labor Category based profile handle */
		if (!this.isProjectFreeText() && !controls['showProfileNotFound'].value) {
			create_requisition_new['profile_id'] = controls['projectProfile'].value;
		} else {
			create_requisition_new['profile'] = controls['projectProfile'].value;
			if (controls['showProfileNotFound'].value) {
				create_requisition_new['profile_not_found'] = true; // when user checked not found category checkbox checked
			} else {
				create_requisition_new['profile_not_found'] = false; // when user checked not found category checkbox unchecked
			}
		}

		/* Requesting manager Details */
		if (requestorManager)
			create_requisition_new['requestingManager'] = requestorManager;

		if (_requisition._isUpdated)
			create_requisition_new['req_id'] = this.requisition.req_id;

		return create_requisition_new;
	}

	addRequisition(create_requisition, withBack: boolean = false) {
		var __this = this;
		this.loadingSubject.next(true);
		var message = this.activityMessengerService.getActivityMessageByActivityName('Create Requisition');
		this.requisitionsService.createRequisition(create_requisition).subscribe(res => {
			this.loadingSubject.next(false);
			if (res.status) {
				this.uploadPreferedCandidateResume(res.requisition.pref_candidates); // Upload resume of preferred candidate
				this.mapValuesWithField(res.requisition);
				this.updatedAt = Date.now();
				this.cdr.detectChanges();
				let uploadMessage="";
				if (res.requisition.pref_candidates.length > 0) {
					/* Filter selected resume by email id after submit response */
					res.requisition.pref_candidates.forEach(function (obj)
					{
						//console.log(obj);
						var selectedResume = __this.preferredCand.filter(
							pref => pref.detail.email === obj.detail.email);

						if (selectedResume.length > 0) {
							uploadMessage = "Refersh the page for viewing the uploaded resume";
							message+=uploadMessage;
						}
                        
					})
				}//console.log(res.message);
				this.layoutUtilsService.showActionNotification(message || res.message, MessageType.Create, 10000, true, false);
				this.goBack(res.requisition.req_id, withBack);
			} else {
				this.layoutUtilsService.showActionNotification(res.message, MessageType.Create, 10000, true, false);
			}
		}, error => {
			this.loadingSubject.next(false);
			this.layoutUtilsService.showActionNotification(error.error.message, MessageType.Create, 10000, true, false);
		});
	}

	updateRequisition(_requisition, withBack: boolean = false) {
		var __this = this;
		this.loadingSubject.next(true);
		//const message = 'Requisition has been updated successfully';//this.activityMessengerService.getActivityMessageByActivityId(1); // 1 for create requisition
		/*let tasks$ = [this.requisitionsService.updateRequisition(_requisition)];*/
		this.requisitionsService.updateRequisition(_requisition).subscribe(res => {
			this.loadingSubject.next(false);
			__this.uploadPreferedCandidateResume(res.requisition.pref_candidates); //Upload resume of preferred candidate
			this.mapValuesWithField(res.requisition);
			this.updatedAt = Date.now();
			this.cdr.detectChanges();
			//const message = `Requisition has been updated successfully.`;
			this.layoutUtilsService.showActionNotification(res.message, MessageType.Update, 10000, true, false);
			this.goBack(res.requisition.req_id, withBack);
		}, error => {
			this.loadingSubject.next(false);
			this.layoutUtilsService.showActionNotification(error.error.message, MessageType.Update, 10000, true, false);
		});
	}

	getComponentTitle() {
		let result = 'New Requisition';
		if (this.duplicate)
			this.subheaderService.setTitle('Create Requisition');
		if (!this.requisition || !this.requisition.project_id || this.duplicate) {
			return result;
		}

		this.viewMode = true;
		this.reqStatus = this.requisition.status;
		result = `Edit Requisition :`;
		return result;
	}

	onAlertClose($event) {
		this.hasFormErrors = false;
	}

	/* Get Requesting,Approving,Hiring Manager Details By Email Id */
	getUserByEmail(val: any, userType: string) {
		var __this = this;
		/* Validate form if email entered */
		if (val) {
			__this.setFieldsValidators(userType);
		} else {
			__this.removeFieldsValidators(userType);
		}
		// Check email valid or not
		if (__this.isEmail(val)) {
			var param = {
				"email": val
			}
			// get user details by entered email
			__this.getUserByEmailId(param, userType);
		} else {
			// Reset filled data
			__this.resetRequestApproveManagerForm('', userType);
		}

	}

	/* Get User By Email Id */
	getUserByEmailId(params: any, userType: string) {
		var __this = this;
		__this.requisitionsService.getUserByEmail(params).subscribe(res => {
			if (res.user)
				__this.resetRequestApproveManagerForm(res.user, userType);
		}, error => {
			if (userType == 'request')
				__this.readOnlyRequestingManager = false;
			else if (userType == 'approve')
				__this.readOnlyApprovingManager = false;
			/*else if(userType=='hire')
				__this.readOnlyHiringManager=false;*/
			__this.resetRequestApproveManagerForm('', userType);
			const message = error.error.message;
			__this.layoutUtilsService.showActionNotification(message, MessageType.Create, 10000, true, false);
		});
	}


	/* Validate Email */
	isEmail(search: string): boolean {
		var result: boolean;
		var regexp = new RegExp(/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/);
		result = regexp.test(search);
		return result;
	}

	/* Reset Hire/Approver Manager Form */
	resetRequestApproveManagerForm(param: any, userType: string) {
		if (param) {
			this.requisitionForm.controls[userType + 'FirstName'].patchValue(param.first_name ? param.first_name : null);
			this.requisitionForm.controls[userType + 'LastName'].patchValue(param.last_name ? param.last_name : null);
			this.requisitionForm.controls[userType + 'Phone'].patchValue(param.phone ? param.phone : null);
			if (userType == 'request')
				this.requisitionForm.controls[userType + 'OrgDep'].patchValue(param.department ? param.department : null);
			this.requisitionForm.controls[userType + 'Id'].patchValue(param.user_id ? param.user_id : null);
		} else {
    		/*this.requisitionForm.controls[userType+'FirstName'].patchValue('');
			this.requisitionForm.controls[userType+'LastName'].patchValue('');
			this.requisitionForm.controls[userType+'Phone'].patchValue('');
			if(userType =='request')
			this.requisitionForm.controls[userType+'OrgDep'].patchValue('');*/
			this.requisitionForm.controls[userType + 'Id'].patchValue(0);
		}
		this.cdr.detectChanges();

	}

	getItemCssClassByStatus(status: string = 'Pending'): string {
		return this.requisitionModel.getItemCssClassByStatus(status);
	}
	getItemStatusString(status: string = 'Pending'): string {
		if (status === 'Pending') {
			return 'Approval Pending';
		} else {
			return status;
		}
	}

	setFieldsValidators(userType: string) {
		// Set Controls Property
		/*var userOrgDep;*/
		const userFirstName = this.requisitionForm.get(userType + 'FirstName');
		const userLastName = this.requisitionForm.get(userType + 'LastName');
		const userEmailName = this.requisitionForm.get(userType + 'Email');
		const userPhoneName = this.requisitionForm.get(userType + 'Phone');
	    /*if(userType =='request')
			userOrgDep = this.requisitionForm.get(userType+'OrgDep');*/
		// Set Validatore
		userFirstName.setValidators([Validators.required]);
		userLastName.setValidators([Validators.required]);
		userEmailName.setValidators([Validators.required, Validators.email]);
		userPhoneName.setValidators([Validators.required]);
		/*if(userType =='request')
		userOrgDep.setValidators([Validators.required]);*/
		// Update Form Controls
		userFirstName.updateValueAndValidity();
		userLastName.updateValueAndValidity();
		userEmailName.updateValueAndValidity();
		userPhoneName.updateValueAndValidity();
        /*if(userType =='request')
			userOrgDep.updateValueAndValidity();*/
	}

	removeFieldsValidators(userType: string) {
		/*var userOrgDep;*/
		if (userType == 'request')
			this.readOnlyRequestingManager = this.requisition.req_id && this.requisition.status!='Draft'? true : false;
		if (userType == 'approve')
			this.readOnlyApprovingManager = this.requisition.req_id && this.requisition.status!='Draft'? true : false;
		/*else if(userType=='hire')
			this.readOnlyHiringManager=true;*/
		// Set Controls Property
		const userFirstName = this.requisitionForm.get(userType + 'FirstName');
		const userLastName = this.requisitionForm.get(userType + 'LastName');
		const userEmailName = this.requisitionForm.get(userType + 'Email');
		const userPhoneName = this.requisitionForm.get(userType + 'Phone');
	    /*if(userType =='request')
			userOrgDep = this.requisitionForm.get(userType+'OrgDep');*/
		// Set Validatore
		userFirstName.setValidators([]);
		userLastName.setValidators([]);
		userEmailName.setValidators([]);
		userPhoneName.setValidators([]);
		/*if(userType =='request')
		userOrgDep.setValidators([]);*/
		// Update Form Controls
		userFirstName.updateValueAndValidity();
		userLastName.updateValueAndValidity();
		userEmailName.updateValueAndValidity();
		userPhoneName.updateValueAndValidity();
        /*if(userType =='request')
			userOrgDep.updateValueAndValidity();*/
	}

	uploadPreferedCandidateResume(prefCandidate: any) {
		var __this = this;
		if (prefCandidate.length > 0) {
			/* Filter selected resume by email id after submit response */
			prefCandidate.forEach(function (obj)
			 {
				 //console.log(obj);
				var selectedResume = __this.preferredCand.filter(
					pref => pref.detail.email === obj.detail.email);
				if (selectedResume.length > 0) {
					__this.uploadFile(selectedResume[0].detail.resume, obj.detail.id); // call upload function to upload file
				}

			})
		}
	}

	uploadFile(filename, candid) {
		var __this = this;
		//console.log(filename);
		const files: Array<File> = __this.fileData;
		if (!files || files.length === 0) {
			return;
		}
		for (let i = 0; i < files.length; i++) {
			if (!files[i][0]) {
				continue;
			}
			let formdata = new FormData();
			if (files[i][0].name === filename) {
				//var extension = files[i][0].name.split('.').pop().toLowerCase();  //file extension from input file
				formdata.append("resume", files[i][0], files[i][0].name);
				__this.requisitionsService.uploadCandidateResume(candid, formdata).subscribe(
					res => 
					{
				}
				, error => { });

				return;
			}

		}
	}

	fileEvent(e, index) {
		this.fileData.push(<File>e.target.files);
		this.preferredCandidates = this.requisitionForm.get('preferredCandidates') as FormArray;
		this.preferredCandidates.at(index)['controls'].selectedFileName.patchValue(e.target.files[0].name);
	}

	minMaxValueValidator() {
		// Form Controls
		const controls = this.requisitionForm.controls;
		// Get Entered Min&Max Value From Form Data
		var minRateValue = Number(controls['minRate'].value);
		var maxRateValue = Number(controls['maxRate'].value);
		//Get FormGroup of Min&Max Rate to set custom validation
		const minRate = this.requisitionForm.get('minRate');
		const maxRate = this.requisitionForm.get('maxRate');
		//Get Entered Min rate value from formControl and added 1 for set validation of Max Rate
		const minValue = Number(this.requisitionForm.controls['minRate'].value) + 1;
		if (minRateValue || maxRateValue) {
			if (minRateValue > maxRateValue) {
				maxRate.setValidators([Validators.required, Validators.pattern(/^[0-9]+(\.[0-9]{1,2})?$/), Validators.min(minValue), Validators.max(99999999)]);
				maxRate.updateValueAndValidity();
				return false;
			} else if (minRateValue && !maxRateValue) {
				maxRate.setValidators([Validators.required, Validators.pattern(/^[0-9]+(\.[0-9]{1,2})?$/), Validators.min(minValue), Validators.max(99999999)]);
				maxRate.updateValueAndValidity();
				return false;
			} else if (!minRateValue && maxRateValue) {
				minRate.setValidators([Validators.required, Validators.pattern(/^[0-9]+(\.[0-9]{1,2})?$/), Validators.max(99999999),]);
				minRate.updateValueAndValidity();
				return false;
			}
		}
	}

	resetMinMaxValueValidator() {
		//Get FormGroup of Min&Max Rate to set custom validation
		const minRate = this.requisitionForm.get('minRate');
		const maxRate = this.requisitionForm.get('maxRate');
		minRate.setValidators([Validators.max(99999999), Validators.pattern(/^[0-9]+(\.[0-9]{1,2})?$/)]);
		maxRate.setValidators([Validators.max(99999999), Validators.pattern(/^[0-9]+(\.[0-9]{1,2})?$/)]);
		minRate.updateValueAndValidity();
		maxRate.updateValueAndValidity();
	}

	onSelectClearance(clearance: any) {
		if (clearance.value == "Other")
			this.selClearanceOther = true;
		else
			this.selClearanceOther = false;
		this.cdr.detectChanges();
	}

	/* On change start date & on select duration,
	   reset end date based on selected start date and duration
	   @param duration: number
    */
	onSelectDurationOrStartDate(duration: number, onChangeDate = false) {	 //onChangeDate true, when user select date from date picker, it is use to show warning message if user select date under 3 weeks
		var startDate = new Date(this.requisitionForm.controls['startDate'].value);
		var endDate: Date;
		endDate = new Date(startDate.setMonth(startDate.getMonth() + duration));
		this.requisitionForm.controls['endDate'].patchValue(endDate);
		this.daysBetween(this.requisitionForm.controls['startDate'].value, onChangeDate);
		this.cdr.detectChanges();
	}

	/* On Change End Date Get Duration By Selected Start Date & End Date,
	   reset duration value by geting duration
	*/
	onSelectEndDate() {
		var durationInMonths = this.diffMonths(this.requisitionForm.controls['startDate'].value, this.requisitionForm.controls['endDate'].value);
		this.requisitionForm.controls['duration'].patchValue(durationInMonths);
	}
	/* Calculate diff from start date to end date */
	diffMonths(startDate, endDate): number {
		var dt1 = new Date(startDate);
		var dt2 = new Date(endDate);
		// Months between years.
		var months = (dt2.getFullYear() - dt1.getFullYear()) * 12;
		// Months between... months.
		months += dt2.getMonth() - dt1.getMonth();
		// Subtract one month if b's date is less that a's.
		if (dt2.getDate() < dt1.getDate()) {
			months--;
		}
		return months;
	}

	// On Change Not Found Category Check Box
	onChangeProfileNotFound(event) {
		if (this.requisition.profile_not_found && event.checked) {
			if (this.requisition.projectProfile) {	// Defined & Defined With Rate
				this.requisitionForm.controls['projectProfile'].patchValue(this.requisition.projectProfile.id);
				this.requisitionForm.controls['category'].setValue(this.requisition.projectProfile.category_id);
			}
			else
				this.requisitionForm.controls['projectProfile'].patchValue(this.requisition.profile);
			/* Reset Min & Max Rate Value From API Response */
			this.requisitionForm.controls['minRate'].patchValue(this.minMaxRateFixedTwoDecimal(this.requisition.min_rate));
			this.requisitionForm.controls['maxRate'].patchValue(this.minMaxRateFixedTwoDecimal(this.requisition.max_rate));
		} else if (!this.requisition.profile_not_found && event.checked) {
			this.requisitionForm.controls['projectProfile'].patchValue(null);
			/* Set Min & Max Rate Null On Checked Not Found Category */
			this.requisitionForm.controls['minRate'].patchValue(null);
			this.requisitionForm.controls['maxRate'].patchValue(null);
		} else if (this.requisition.profile_not_found && !event.checked) {
			this.requisitionForm.controls['projectProfile'].patchValue(null);
		} else if (!this.requisition.profile_not_found && !event.checked) {
			if (this.requisition.projectProfile) {	// Defined & Defined With Rate
				this.requisitionForm.controls['projectProfile'].patchValue(this.requisition.projectProfile.id);
				this.requisitionForm.controls['category'].setValue(this.requisition.projectProfile.category_id);
			}
			else
				this.requisitionForm.controls['projectProfile'].patchValue(this.requisition.profile);
			/* Reset Min & Max Rate Value From API Response */
			this.requisitionForm.controls['minRate'].patchValue(this.minMaxRateFixedTwoDecimal(this.requisition.min_rate));
			this.requisitionForm.controls['maxRate'].patchValue(this.minMaxRateFixedTwoDecimal(this.requisition.max_rate));
		}
	}

	// Check start date within three weeks
	daysBetween(startDate, onChangeDate) {
		this.error = { isError: false, errorMessage: "" };
		var today = new Date();
		let numberOfDays = Math.abs((+startDate - +today) / (1000 * 60 * 60 * 24));
		if (numberOfDays < 20 && onChangeDate && !this.accessRoles.isAdmin())
			this.error = { isError: true, errorMessage: "The anticipated start date should not fall within 3 weeks from today to allow for security and personnel checks." };
	}

	minMaxRateFixedTwoDecimal(value) {
		if (value)
			return value.toFixed(2);
		else
			return '';
	}

	/* Handle show/hide/disabled options of a deleted custom field for new requisition, edit requisition & duplicate create a requisition. */
	checkFieldStatus(archived, fieldId): Boolean {
		if (!archived || archived == false) {
			return true;
		} else {
			var fieldExitsInReq = false;
			if (this.requisition && this.requisition.req_params) {
				var result = this.requisition.req_params.find(param => {
					return param.param_id == fieldId;
				});
				if (result && Object.keys(result).length > 0)
					fieldExitsInReq = true;
			}
			if ((this.editMode == true && fieldExitsInReq == true) && (!this.duplicate && this.requisition.status != 'Rejected'))
				return true;
			else
				return false;
		}
	}

	/* Unfortunately mat-radio-group into mat-form-field is not supported yet.
	 * So we have created a function to check radio fields is valid or not.
	 */
	checkRadioFormControlIsInvalid(fieldName) {
		if (this.onSubmitClicked && this.requisitionForm.controls['field_' + fieldName].invalid)
			return true;
		else
			return false;
	}

	/* ngOnDestroy clean breadcambs */
	ngOnDestroy() {
		this.subheaderService.setBreadcrumbs(null);
	}

	/* Check project category/profile deleted, 
	 which category/profile used in this requisition
	 @param Number Project Id
	 @param Json Requisition Project Profile 
	 */
	isDeletedProjectCategoryProfile(projectId, reqProjectProfile) {
		if (this.projectProfile && this.projectProfile.length > 0) {
			var result = null;
			var catExits = false;
			this.projectProfile.forEach(obj => {
				result = obj.projectProfiles.find(profile => {
					return profile.project_id == projectId && profile.category_id == reqProjectProfile.category_id && profile.id == reqProjectProfile.id
				});
				if (result) {
					catExits = true;
				}
			});
			if (!catExits) {
				this.projectCategoryProfileDeleted = true;
			}
		} else if (reqProjectProfile) {
			this.projectCategoryProfileDeleted = true;
		}
	}

	isCandidateEditable(candidate_status_id: number): boolean {
		return this.candidatesService.isCandidateEditable(candidate_status_id) &&
			RequisitionService.isCandidateEditable(this.requisition);
	}

	isProjectFreeText(): boolean {
		if (this.requisition &&
			this.requisition.project &&
			this.requisition.project.laborCategory === 'Free Text') {
			return true;
		}
		return this.accessRoles.isProjectFreeText();
	}

	/*---------------------------------------------------------------------------
		check duplicate User Details By Email Id for alternate data or candidate
		userType = 1 for Alternate
		userType = 2 for Candidate
	-----------------------------------------------------------------------------*/
	checkDuplicateUserByEmail(val: any,index:number,userType) {
		//formGroup.value.altEmail
		var __this = this;
		// Check email valid or not
		if (__this.isEmail(val)) {
			let userKey = 'altUsers';
			let emailKey = ''
			let errorMessage = 'altEmail';
			if(userType == 1) {
				userKey = 'altUsers';
				emailKey = 'altEmail';
				errorMessage = "Duplicate alternate user email";
			} else {
				userKey = 'preferredCandidates';
				emailKey = 'prefEmail';
				errorMessage = "Duplicate Preferred candidate email";
			}
			// check this email already exists in other alternate email form
			let altUsers = __this.requisitionForm.get(userKey) as FormArray;
			for(let i = 0; i < altUsers.length; i++){
				let formVal = altUsers['value'][i][emailKey];
				if (index != i && val == formVal) {
					// reset emailid and show a message duplicate email id 
					if(userType == 1) {
						__this.altUsers.at(index)['controls'][emailKey].patchValue("");
					} else if(userType == 2) {
						__this.preferredCandidates.at(index)['controls'][emailKey].patchValue("");
					}
				    __this.layoutUtilsService.showActionNotification(errorMessage, MessageType.Create, 10000, true, false);
					break;
				}
			}
		}
	}
}
